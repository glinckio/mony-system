import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  ConsultaCustoMonyAdmin,
  ConsultaLogsMonyAdmin,
  CustoMonyAdmin,
  LimitesMony,
  LogsMonyAdmin,
  NovaVersaoMony,
  PrecosIaAdmin,
  VersaoMonyAdmin,
  VersaoMonyResumoAdmin,
  VersoesMonyAdmin,
} from '@mony/shared/admin';
import { inicioDoDiaNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';

import { Clock } from '../../core/clock/clock';
import { Configuracao } from '../../core/config/configuracao';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { FILAS, idDeJob } from '../../core/filas/filas';
import type { DadosJobAvaliacao } from '../mony/avaliacao/pedidos-avaliacao';
import {
  ConfigMonyService,
  esquemaResultadoAvaliacao,
  MINIMO_AVALIACAO,
  type ResultadoAvaliacao,
} from '../mony/config.service';
import { LimitesMonyService } from '../mony/limites.service';
import { PROMPT_SISTEMA } from '../mony/prompts/sistema';
import { AdminMonyRepository, type LinhaResumoVersaoMony } from './admin-mony.repository';
import { AVALIACAO_PARADA_MS, custoDoModelo, situacaoDaAvaliacao } from './dominio/mony';

/** O trecho da mensagem do usuário que aparece no log com erro. */
const MENSAGEM_NO_LOG = 500;

/**
 * A seção Mony do painel (T-141e, doc 13): versões do prompt do sistema (criar, avaliar no worker,
 * ativar com 95% ou mais, doc 08), chamadas ao modelo com erro, custo por período pela tabela de
 * preços e os limites de uso por usuário por dia (T-151). Ver logs (com o texto do usuário) e mudar qualquer coisa grava `auditoria`.
 */
@Injectable()
export class AdminMonyService {
  constructor(
    private readonly repositorio: AdminMonyRepository,
    private readonly config: ConfigMonyService,
    private readonly limitesMony: LimitesMonyService,
    private readonly configuracao: Configuracao,
    private readonly clock: Clock,
    @InjectQueue(FILAS.monyAvaliacao) private readonly fila: Queue<DadosJobAvaliacao>,
  ) {}

  async versoes(): Promise<VersoesMonyAdmin> {
    const agora = this.clock.agora();
    const linhas = await this.repositorio.versoes();
    return {
      itens: linhas.map((linha) => this.resumo(linha, agora)),
      versaoAtiva: linhas.find(({ ativo }) => ativo)?.versao ?? null,
      minimoAvaliacao: MINIMO_AVALIACAO,
      avaliacaoDisponivel: this.avaliacaoDisponivel(),
    };
  }

  /** A versão 0 é o prompt do código: o ponto de partida quando ainda não há versão. */
  async versao(versao: number): Promise<VersaoMonyAdmin> {
    if (versao === 0) {
      return {
        versao: 0,
        ativa: (await this.repositorio.versaoAtiva()) === null,
        modelo: this.configuracao.modeloIa,
        criadoEm: new Date(0).toISOString(),
        criadoPor: null,
        situacaoAvaliacao: 'nunca',
        avaliacao: null,
        podeAtivar: false,
        promptSistema: PROMPT_SISTEMA,
        descricoes: {},
        avaliacaoFalha: null,
        casos: [],
      };
    }
    const linha = await this.repositorio.versao(versao);
    if (!linha) throw new ErroDominio('NAO_ENCONTRADO');
    const resumo = this.resumo(linha, this.clock.agora());
    const avaliacao = this.lerAvaliacao(linha.avaliacao);
    const descricoes = (linha.ferramentas as { descricoes?: unknown } | null)?.descricoes;
    return {
      ...resumo,
      promptSistema: linha.promptSistema,
      descricoes:
        descricoes && typeof descricoes === 'object' ? (descricoes as Record<string, string>) : {},
      avaliacaoFalha: this.situacao(linha, this.clock.agora()).falha,
      casos: avaliacao?.casos ?? [],
    };
  }

  async criar(adminId: string, dados: NovaVersaoMony, ip: string): Promise<VersaoMonyAdmin> {
    const versao = await this.config.criarVersao(
      {
        promptSistema: dados.promptSistema,
        descricoes: dados.descricoes,
        ...(dados.modelo === null ? {} : { modelo: dados.modelo }),
      },
      adminId,
    );
    const criada = await this.versao(versao);
    await this.repositorio.auditar({
      adminId,
      acao: 'mony.versao_criada',
      entidade: 'mony_config',
      entidadeId: String(versao),
      ip,
      depois: {
        versao,
        modelo: criada.modelo,
        caracteres: dados.promptSistema.length,
        ferramentas: Object.keys(dados.descricoes),
      },
    });
    return criada;
  }

  /**
   * Põe a avaliação na fila `mony-avaliacao`; o worker roda as frases de teste num processo à parte
   * e grava o resultado. Com o modelo falso o resultado não vale (só as frases por regra rodam).
   */
  async avaliar(adminId: string, versao: number, ip: string): Promise<VersaoMonyAdmin> {
    if (!this.avaliacaoDisponivel()) {
      throw new ErroDominio('CONFLITO', {
        mensagem: 'Este ambiente usa o modelo falso: a avaliação não vale aqui.',
      });
    }
    // Não encontrada dá 404; a que não se lê, 409.
    await this.config.daVersao(versao);
    const agora = this.clock.agora();
    const pedida = await this.repositorio.pedirAvaliacao({
      versao,
      agora,
      livreAntesDe: new Date(agora.getTime() - AVALIACAO_PARADA_MS),
      adminId,
      ip,
    });
    if (!pedida) {
      throw new ErroDominio('CONFLITO', { mensagem: 'A avaliação desta versão já está rodando.' });
    }
    try {
      await this.fila.add(
        'avaliar',
        { versao, pedidaEm: agora.toISOString() },
        { jobId: idDeJob('avaliar-mony', versao, agora.getTime()), attempts: 1 },
      );
    } catch (erro) {
      await this.repositorio.falharAvaliacao(versao, agora, 'A fila não aceitou o pedido.');
      throw erro;
    }
    return this.versao(versao);
  }

  /** Ativa se a avaliação passou (`ConfigMonyService.ativar`); a anterior sai. */
  async ativar(adminId: string, versao: number, ip: string): Promise<VersaoMonyAdmin> {
    const antes = await this.repositorio.versaoAtiva();
    if (antes !== versao) {
      await this.config.ativar(versao);
      await this.repositorio.auditar({
        adminId,
        acao: 'mony.versao_ativada',
        entidade: 'mony_config',
        entidadeId: String(versao),
        ip,
        antes: { versaoAtiva: antes },
        depois: { versaoAtiva: versao },
      });
    }
    return this.versao(versao);
  }

  /** As chamadas ao modelo com erro. Mostra o texto do usuário: cada página grava `auditoria`. */
  async logs(adminId: string, consulta: ConsultaLogsMonyAdmin, ip: string): Promise<LogsMonyAdmin> {
    const linhas = await this.repositorio.logsComErro({
      ...(consulta.de ? { desde: inicioDoDiaNoFuso(consulta.de) } : {}),
      ...(consulta.ate ? { ate: inicioDoDiaNoFuso(somarDias(consulta.ate, 1)) } : {}),
      ...(consulta.cursor ? { cursor: consulta.cursor } : {}),
      limite: consulta.limite + 1,
    });
    const pagina = linhas.slice(0, consulta.limite);
    await this.repositorio.auditar({
      adminId,
      acao: 'mony.logs_vistos',
      entidade: 'logs_ia',
      ip,
      depois: {
        de: consulta.de ?? null,
        ate: consulta.ate ?? null,
        cursor: consulta.cursor ?? null,
        resultados: pagina.length,
      },
    });
    return {
      itens: pagina.map((linha) => ({
        id: linha.id,
        usuario: linha.usuario,
        modelo: linha.modelo,
        ferramenta: linha.ferramenta,
        duracaoMs: linha.duracaoMs,
        erro: linha.erro ?? '',
        mensagem: linha.mensagem?.conteudo?.slice(0, MENSAGEM_NO_LOG) ?? null,
        criadoEm: linha.criadoEm.toISOString(),
      })),
      proximoCursor: linhas.length > consulta.limite ? (pagina.at(-1)?.id ?? null) : null,
    };
  }

  /** Tokens e custo por modelo no período (dias de São Paulo, os dois inclusos). */
  async custo(consulta: ConsultaCustoMonyAdmin): Promise<CustoMonyAdmin> {
    const [uso, precos] = await Promise.all([
      this.repositorio.uso(
        inicioDoDiaNoFuso(consulta.de),
        inicioDoDiaNoFuso(somarDias(consulta.ate, 1)),
      ),
      this.repositorio.precos(),
    ]);
    const modelos = uso.modelos.map((modelo) => ({
      ...modelo,
      custoCentavos: custoDoModelo(modelo, precos),
    }));
    return {
      de: consulta.de,
      ate: consulta.ate,
      modelos,
      totalCentavos: modelos.reduce((total, { custoCentavos }) => total + (custoCentavos ?? 0), 0),
      chamadas: modelos.reduce((total, { chamadas }) => total + chamadas, 0),
      chamadasComErro: uso.comErro,
      modelosSemPreco: modelos
        .filter(({ custoCentavos }) => custoCentavos === null)
        .map(({ modelo }) => modelo),
    };
  }

  async precos(): Promise<PrecosIaAdmin> {
    return { precos: await this.repositorio.precos() };
  }

  async salvarPrecos(adminId: string, dados: PrecosIaAdmin, ip: string): Promise<PrecosIaAdmin> {
    const antes = await this.repositorio.precos();
    await this.repositorio.salvarPrecos({ precos: dados.precos, antes, adminId, ip });
    return this.precos();
  }

  /** T-151: os limites diários que valem agora (os padrões, sem linha salva). */
  async limites(): Promise<LimitesMony> {
    this.limitesMony.esquecer();
    return this.limitesMony.obter();
  }

  async salvarLimites(adminId: string, dados: LimitesMony, ip: string): Promise<LimitesMony> {
    const antes = await this.limites();
    await this.repositorio.salvarLimites({ limites: dados, antes, adminId, ip });
    return this.limites();
  }

  private avaliacaoDisponivel(): boolean {
    return this.configuracao.provedorIa !== 'fake';
  }

  private resumo(linha: LinhaResumoVersaoMony, agora: Date): VersaoMonyResumoAdmin {
    const avaliacao = this.lerAvaliacao(linha.avaliacao);
    return {
      versao: linha.versao,
      ativa: linha.ativo,
      modelo: linha.modelo,
      criadoEm: linha.criadoEm.toISOString(),
      criadoPor: linha.criadoPor,
      situacaoAvaliacao: this.situacao(linha, agora).situacao,
      avaliacao: avaliacao
        ? {
            total: avaliacao.total,
            aprovados: avaliacao.aprovados,
            percentual: avaliacao.percentual,
            modelo: avaliacao.modelo,
            em: avaliacao.em,
          }
        : null,
      podeAtivar: !linha.ativo && (avaliacao?.percentual ?? 0) >= MINIMO_AVALIACAO,
    };
  }

  private situacao(linha: LinhaResumoVersaoMony, agora: Date) {
    const avaliacao = this.lerAvaliacao(linha.avaliacao);
    return situacaoDaAvaliacao({
      avaliadaEm: avaliacao ? new Date(avaliacao.em) : null,
      pedidaEm: linha.avaliacaoPedidaEm,
      falha: linha.avaliacaoFalha,
      agora,
    });
  }

  private lerAvaliacao(valor: unknown): ResultadoAvaliacao | null {
    const resultado = esquemaResultadoAvaliacao.safeParse(valor);
    return resultado.success ? resultado.data : null;
  }
}
