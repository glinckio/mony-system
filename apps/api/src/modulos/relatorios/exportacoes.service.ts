import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import {
  type DadosPedidoExportacao,
  type Exportacao,
  periodoPadraoRelatorio,
  VALIDADE_URL_EXPORTACAO_SEGUNDOS,
} from '@mony/shared/relatorios';
import type { Queue } from 'bullmq';

import { ArmazenamentoArquivos } from '../../core/arquivos/armazenamento-arquivos';
import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { FILAS, idDeJob } from '../../core/filas/filas';
import { CotasService } from '../planos/cotas.service';
import { montarDocumento } from './exportacao/documento';
import { gerarPdf } from './exportacao/pdf';
import { gerarXlsx } from './exportacao/xlsx';
import { type ExportacaoGravada, ExportacoesRepository } from './exportacoes.repository';
import { RelatoriosService } from './relatorios.service';

/** O job da fila `relatorios` que gera o arquivo. */
export const JOB_EXPORTAR = 'exportar';
export interface DadosJobExportar {
  exportacaoId: string;
}
/** Tentativas do job; na última falha, a exportação fica com `erro`. */
export const TENTATIVAS_EXPORTACAO = 3;

const TIPO_CONTEUDO = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

const dia = (data: Date): string => data.toISOString().slice(0, 10);

/**
 * Exportação dos relatórios em PDF e XLSX (RN-151, T-125): o pedido grava a exportação e põe o
 * job na fila `relatorios`; o worker gera o arquivo com os mesmos números das rotas de relatório,
 * guarda no S3 em `exportacoes/` e marca como pronta; a consulta devolve a URL assinada de 24 h.
 * Bloqueada no gratuito (RN-120).
 */
@Injectable()
export class ExportacoesRelatorio {
  constructor(
    private readonly repositorio: ExportacoesRepository,
    private readonly relatorios: RelatoriosService,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly cotas: CotasService,
    private readonly clock: Clock,
    @InjectQueue(FILAS.relatorios) private readonly fila: Queue<DadosJobExportar>,
  ) {}

  async pedir(contexto: Contexto, pedido: DadosPedidoExportacao): Promise<Exportacao> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.cotas.conferirExportacao(contexto);
    const periodo =
      pedido.inicio !== undefined && pedido.fim !== undefined
        ? { inicio: pedido.inicio, fim: pedido.fim }
        : periodoPadraoRelatorio(
            dataNoFuso(this.clock.agora(), (await this.repositorio.usuario(usuarioId)).fuso),
          );
    const dados = { formato: pedido.formato, ...periodo };
    const exportacao =
      (await this.repositorio.emAndamento(usuarioId, dados)) ??
      (await this.repositorio.criar(usuarioId, dados));
    await this.fila.add(
      JOB_EXPORTAR,
      { exportacaoId: exportacao.id },
      { jobId: idDeJob(JOB_EXPORTAR, exportacao.id), attempts: TENTATIVAS_EXPORTACAO },
    );
    return this.paraResposta(exportacao);
  }

  async buscar(contexto: Contexto, id: string): Promise<Exportacao> {
    const exportacao = await this.repositorio.buscar(usuarioDoContexto(contexto), id);
    if (!exportacao) throw new ErroDominio('NAO_ENCONTRADO');
    return this.paraResposta(exportacao);
  }

  /** No worker: gera o arquivo, guarda no S3 e marca a exportação como pronta. */
  async gerar(exportacaoId: string): Promise<void> {
    const exportacao = await this.repositorio.buscarParaGerar(exportacaoId);
    if (exportacao?.status !== 'processando') return;
    const { usuarioId, formato } = exportacao;
    // Os mesmos números das rotas; como rotina, sem o corte do gratuito (que não exporta).
    const contexto: Contexto = { usuarioId, origem: 'sistema' };
    const consulta = { inicio: dia(exportacao.inicio), fim: dia(exportacao.fim) };
    const [mensal, anual, despesas, receitas, diasDaSemana, cartoes, formasPagamento] =
      await Promise.all([
        this.relatorios.mensal(contexto, consulta),
        this.relatorios.anual(contexto, consulta),
        this.relatorios.categorias(contexto, { ...consulta, tipo: 'despesa' }),
        this.relatorios.categorias(contexto, { ...consulta, tipo: 'receita' }),
        this.relatorios.diasDaSemana(contexto, consulta),
        this.relatorios.cartoes(contexto, consulta),
        this.relatorios.formasPagamento(contexto, consulta),
      ]);
    const { nome, fuso } = await this.repositorio.usuario(usuarioId);
    const agora = this.clock.agora();
    const documento = montarDocumento(
      { mensal, anual, despesas, receitas, diasDaSemana, cartoes, formasPagamento },
      { nome, geradoEm: { data: dataNoFuso(agora, fuso), hora: horaNoFuso(agora, fuso) } },
    );
    const corpo = formato === 'pdf' ? await gerarPdf(documento) : gerarXlsx(documento);
    const chave = `exportacoes/relatorios/${usuarioId}/${exportacao.id}.${formato}`;
    await this.armazenamento.gravar(chave, corpo, TIPO_CONTEUDO[formato]);
    await this.repositorio.concluir(exportacao.id, chave, this.clock.agora());
  }

  /** As tentativas acabaram: a exportação fica com `erro` e o app oferece pedir de novo. */
  async falhar(exportacaoId: string): Promise<void> {
    await this.repositorio.falhar(exportacaoId, this.clock.agora());
  }

  private async paraResposta(exportacao: ExportacaoGravada): Promise<Exportacao> {
    const inicio = dia(exportacao.inicio);
    const fim = dia(exportacao.fim);
    const pronta = exportacao.status === 'pronta' && exportacao.chaveArquivo !== null;
    const url =
      pronta && exportacao.chaveArquivo !== null
        ? await this.armazenamento.urlDeLeitura(
            exportacao.chaveArquivo,
            VALIDADE_URL_EXPORTACAO_SEGUNDOS,
            `relatorio-${inicio}-a-${fim}.${exportacao.formato}`,
          )
        : null;
    return {
      id: exportacao.id,
      formato: exportacao.formato,
      inicio,
      fim,
      status: exportacao.status,
      url,
      expiraEm:
        url === null
          ? null
          : new Date(
              this.clock.agora().getTime() + VALIDADE_URL_EXPORTACAO_SEGUNDOS * 1000,
            ).toISOString(),
      criadoEm: exportacao.criadoEm.toISOString(),
    };
  }
}
