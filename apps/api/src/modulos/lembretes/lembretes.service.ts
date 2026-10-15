import { Injectable } from '@nestjs/common';
import type { AcessoRecurso } from '@mony/shared/compartilhamentos';
import type { CanalLembrete } from '@mony/shared/enums';
import type {
  AlarmesLembretes,
  ConsultaLembretes,
  DadosAdiamentoLembrete,
  DadosAtualizacaoLembrete,
  DadosConclusaoLembrete,
  DadosNovoLembrete,
  Lembrete,
  ListaLembretes,
} from '@mony/shared/lembretes';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import {
  CompartilhamentosService,
  type RecursoRecebido,
} from '../compartilhamentos/compartilhamentos.service';
import { SincronizacaoAlarmes } from '../notificacoes/sincronizacao-alarmes';
import { CotasService } from '../planos/cotas.service';
import { adiarAte, agendar, alarmesDe, concluir, inicioDoMinuto } from './dominio/agenda';
import {
  type LembreteGravado,
  LembretesRepository,
  type TransacaoLembretes,
} from './lembretes.repository';

/** Como o lembrete chega a quem vê (RN-074). */
type Visao = Pick<Lembrete, 'acesso' | 'dono' | 'compartilhadoCom'>;

const PROPRIO_SEM_CONVITES: Visao = { acesso: 'dono', dono: null, compartilhadoCom: 0 };

function paraLembrete(linha: LembreteGravado, visao: Visao): Lembrete {
  return {
    id: linha.id,
    titulo: linha.titulo,
    dataHora: linha.dataHora.toISOString(),
    recorrencia: linha.recorrencia,
    canais: linha.canais,
    status: linha.status,
    adiadoAte: linha.adiadoAte?.toISOString() ?? null,
    pendente: linha.status === 'ativo' && linha.disparadoEm !== null,
    ...visao,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

const temAlarme = (canais: readonly CanalLembrete[]) => canais.includes('alarme');

const naoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Lembrete não encontrado.' });

const repeticaoAcabou = () =>
  new ErroDominio('REQUISICAO_INVALIDA', {
    mensagem: 'A repetição termina antes do primeiro aviso.',
    detalhes: { campo: 'recorrencia' },
  });

/**
 * Lembretes (RN-075 a RN-077, doc 09). O servidor é a fonte da verdade: a rotina por minuto
 * (`DisparoLembretes`) manda o push, e o aparelho agenda os alarmes pela lista de `alarmes`. Toda
 * mudança num lembrete com alarme manda o push silencioso para o app buscar a lista de novo.
 *
 * Compartilhado (RN-074, T-124c), o lembrete continua do dono (a hora, o fuso, os alarmes e a cota
 * são dele): quem foi convidado vê e recebe o aviso; com `editar`, também conclui e adia, para
 * todos. Mudar, excluir e convidar são do dono.
 */
@Injectable()
export class LembretesService {
  constructor(
    private readonly repositorio: LembretesRepository,
    private readonly cotas: CotasService,
    private readonly sincronizacao: SincronizacaoAlarmes,
    private readonly compartilhamentos: CompartilhamentosService,
    private readonly clock: Clock,
  ) {}

  /** Os próprios e os compartilhados com o usuário (RN-074), na mesma ordem. */
  async listar(contexto: Contexto, consulta: ConsultaLembretes): Promise<ListaLembretes> {
    const usuarioId = usuarioDoContexto(contexto);
    const recebidos = await this.compartilhamentos.recebidos(usuarioId, 'lembrete');
    const linhas = await this.repositorio.listar(
      usuarioId,
      consulta.status,
      recebidos.map(({ recursoId }) => recursoId),
    );
    return { itens: await this.comVisao(usuarioId, linhas, recebidos) };
  }

  /** RN-074: o dono e quem foi convidado (aceito) leem. */
  async buscar(contexto: Contexto, id: string): Promise<Lembrete> {
    const { donoId } = await this.acesso(contexto, id, 'ver');
    const linha = await this.repositorio.buscar(donoId, id);
    if (!linha) throw naoEncontrado();
    return this.umComVisao(contexto, linha);
  }

  /** RN-075; RN-120: no gratuito, até 5 lembretes ativos. */
  async criar(contexto: Contexto, dados: DadosNovoLembrete): Promise<Lembrete> {
    const usuarioId = usuarioDoContexto(contexto);
    const agora = this.clock.agora();
    const fuso = await this.repositorio.fusoDoUsuario(usuarioId);
    const agenda = agendar(new Date(dados.dataHora), dados.recorrencia ?? null, fuso);
    if (!agenda.ok) throw repeticaoAcabou();
    this.conferirFuturo(agenda.dataHora, agora);
    const canais = [...new Set(dados.canais)];
    const criado = await this.repositorio.emTransacao(async (tx) => {
      await this.cotas.conferirQuantidade(contexto, 'lembrete_ativo', tx);
      return this.repositorio.criar(tx, {
        usuarioId,
        titulo: dados.titulo,
        dataHora: agenda.dataHora,
        recorrencia: agenda.recorrencia,
        canais,
      });
    });
    if (temAlarme(canais)) await this.sincronizacao.avisar(usuarioId);
    return paraLembrete(criado, PROPRIO_SEM_CONVITES);
  }

  /**
   * Muda o título, a data e hora, a repetição ou os canais. Mudar a data ou a repetição recomeça
   * a agenda (tira a soneca e o "tocou"); uma data nova reativa o lembrete feito, dentro do limite
   * do gratuito (RN-120). Só o dono (RN-074).
   */
  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoLembrete,
  ): Promise<Lembrete> {
    const { donoId: usuarioId } = await this.acesso(contexto, id, 'dono');
    const agora = this.clock.agora();
    const fuso = await this.repositorio.fusoDoUsuario(usuarioId);
    const { antes, depois } = await this.repositorio.emTransacao(async (tx) => {
      const atual = await this.exigir(tx, usuarioId, id);
      const mudaAgenda = dados.dataHora !== undefined || dados.recorrencia !== undefined;
      let agenda: { dataHora: Date; recorrencia: string | null } | null = null;
      if (mudaAgenda) {
        const recorrencia = dados.recorrencia === undefined ? atual.recorrencia : dados.recorrencia;
        // Só a repetição: recomeça da data atual, sem voltar para antes de agora nem tocar de
        // novo a ocorrência que já tocou.
        const depoisDe = new Date(
          Math.max(agora.getTime(), atual.disparadoEm === null ? 0 : atual.dataHora.getTime()),
        );
        const resultado =
          dados.dataHora === undefined
            ? agendar(
                atual.dataHora,
                recorrencia,
                fuso,
                recorrencia === null ? undefined : depoisDe,
              )
            : agendar(new Date(dados.dataHora), recorrencia, fuso);
        if (!resultado.ok) throw repeticaoAcabou();
        if (dados.dataHora !== undefined) this.conferirFuturo(resultado.dataHora, agora);
        agenda = resultado;
      }
      const reativa = atual.status === 'concluido' && dados.dataHora !== undefined;
      if (reativa) await this.cotas.conferirQuantidade(contexto, 'lembrete_ativo', tx);
      const recomeca = agenda !== null && agenda.dataHora.getTime() !== atual.dataHora.getTime();
      const gravado = await this.repositorio.atualizar(tx, id, {
        ...(dados.titulo === undefined ? {} : { titulo: dados.titulo }),
        ...(dados.canais === undefined ? {} : { canais: [...new Set(dados.canais)] }),
        ...(agenda === null ? {} : { dataHora: agenda.dataHora, recorrencia: agenda.recorrencia }),
        ...(recomeca || reativa ? { disparadoEm: null, adiadoAte: null } : {}),
        ...(reativa ? { status: 'ativo' as const } : {}),
      });
      return { antes: atual, depois: gravado };
    });
    if (temAlarme(antes.canais) || temAlarme(depois.canais)) {
      await this.sincronizacao.avisar(usuarioId);
    }
    return this.umComVisao(contexto, depois);
  }

  /**
   * Excluir é cancelar: o lembrete some das listas e dos alarmes, e os convites dele saem junto. Só
   * o dono (RN-074).
   */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const { donoId: usuarioId } = await this.acesso(contexto, id, 'dono');
    const antes = await this.repositorio.emTransacao(async (tx) => {
      const atual = await this.exigir(tx, usuarioId, id);
      await this.repositorio.atualizar(tx, id, { status: 'cancelado', adiadoAte: null });
      return atual;
    });
    await this.compartilhamentos.recursoExcluido('lembrete', id);
    if (antes.status === 'ativo' && temAlarme(antes.canais)) {
      await this.sincronizacao.avisar(usuarioId);
    }
  }

  /**
   * RN-076: o [Feito], da lista ou da notificação (com a ocorrência que tocou). Compartilhado, com
   * `editar`: vale para todos (RN-074).
   */
  async concluir(contexto: Contexto, id: string, dados: DadosConclusaoLembrete): Promise<Lembrete> {
    const { donoId: usuarioId } = await this.acesso(contexto, id, 'editar');
    const fuso = await this.repositorio.fusoDoUsuario(usuarioId);
    const { antes, depois } = await this.repositorio.emTransacao(async (tx) => {
      const atual = await this.exigir(tx, usuarioId, id);
      // O mesmo [Feito] de novo (a notificação e a lista) não muda nada.
      if (atual.status !== 'ativo') return { antes: atual, depois: atual };
      const ocorrencia = dados.ocorrencia === undefined ? undefined : new Date(dados.ocorrencia);
      const conclusao = concluir(atual, ocorrencia, fuso);
      const gravado = await this.repositorio.atualizar(
        tx,
        id,
        conclusao.concluir
          ? { status: 'concluido', adiadoAte: null }
          : { ...conclusao.mudancas, disparadoEm: null },
      );
      return { antes: atual, depois: gravado };
    });
    if (antes !== depois && temAlarme(antes.canais)) await this.sincronizacao.avisar(usuarioId);
    return this.umComVisao(contexto, depois);
  }

  /**
   * RN-076: adiar por 10 minutos (o padrão), 1 hora ou para amanhã; a soneca toca de novo.
   * Compartilhado, com `editar`: a soneca é de todos, e "amanhã" é no fuso do dono (RN-074).
   */
  async adiar(contexto: Contexto, id: string, dados: DadosAdiamentoLembrete): Promise<Lembrete> {
    const { donoId: usuarioId } = await this.acesso(contexto, id, 'editar');
    const agora = this.clock.agora();
    const fuso = await this.repositorio.fusoDoUsuario(usuarioId);
    const gravado = await this.repositorio.emTransacao(async (tx) => {
      const atual = await this.exigir(tx, usuarioId, id);
      if (atual.status !== 'ativo') {
        throw new ErroDominio('CONFLITO', { mensagem: 'Este lembrete já foi feito.' });
      }
      return this.repositorio.atualizar(tx, id, {
        adiadoAte: adiarAte(atual, dados.opcao, agora, fuso),
      });
    });
    if (temAlarme(gravado.canais)) await this.sincronizacao.avisar(usuarioId);
    return this.umComVisao(contexto, gravado);
  }

  /**
   * Doc 09: os próximos alarmes, para o aparelho agendar (`mony-alarm`). Só os próprios: quem foi
   * convidado recebe o push (T-124c).
   */
  async alarmes(contexto: Contexto): Promise<AlarmesLembretes> {
    const usuarioId = usuarioDoContexto(contexto);
    const [fuso, lembretes] = await Promise.all([
      this.repositorio.fusoDoUsuario(usuarioId),
      this.repositorio.comAlarme(usuarioId),
    ]);
    return {
      alarmes: alarmesDe(lembretes, this.clock.agora(), fuso).map((alarme) => ({
        ...alarme,
        instante: alarme.instante.toISOString(),
      })),
    };
  }

  private acesso(contexto: Contexto, id: string, exigido: AcessoRecurso) {
    return this.compartilhamentos.verificarAcesso(
      usuarioDoContexto(contexto),
      'lembrete',
      id,
      exigido,
    );
  }

  private async umComVisao(contexto: Contexto, linha: LembreteGravado): Promise<Lembrete> {
    const [lembrete] = await this.comVisao(usuarioDoContexto(contexto), [linha]);
    if (!lembrete) throw naoEncontrado();
    return lembrete;
  }

  /** Como cada lembrete chega ao usuário: dono, ou convidado (com quem é o dono). */
  private async comVisao(
    usuarioId: string,
    linhas: readonly LembreteGravado[],
    recebidos?: readonly RecursoRecebido[],
  ): Promise<Lembrete[]> {
    const [deOutros, pessoas] = await Promise.all([
      recebidos ??
        (linhas.some((linha) => linha.usuarioId !== usuarioId)
          ? this.compartilhamentos.recebidos(usuarioId, 'lembrete')
          : []),
      this.compartilhamentos.pessoasPorRecurso(
        'lembrete',
        linhas.map(({ id }) => id),
      ),
    ]);
    const recebido = new Map(deOutros.map((item) => [item.recursoId, item]));
    return linhas.map((linha) => {
      const deOutro = linha.usuarioId === usuarioId ? undefined : recebido.get(linha.id);
      return paraLembrete(linha, {
        acesso: deOutro?.acesso ?? 'dono',
        dono: deOutro?.dono ?? null,
        compartilhadoCom: pessoas.get(linha.id) ?? 0,
      });
    });
  }

  private async exigir(
    tx: TransacaoLembretes,
    usuarioId: string,
    id: string,
  ): Promise<LembreteGravado> {
    const lembrete = await this.repositorio.travar(tx, usuarioId, id);
    if (!lembrete) throw naoEncontrado();
    return lembrete;
  }

  /** O primeiro aviso não pode ter passado (o minuto de agora ainda vale). */
  private conferirFuturo(dataHora: Date, agora: Date): void {
    if (dataHora.getTime() < inicioDoMinuto(agora).getTime()) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Escolha uma data e hora que ainda não passou.',
        detalhes: { campo: 'dataHora' },
      });
    }
  }
}
