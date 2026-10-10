import { Injectable, Logger } from '@nestjs/common';
import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import type { TipoTransacao } from '@mony/shared/enums';
import {
  type AgendaRecorrencia,
  type DadosAtualizacaoRecorrencia,
  type DadosNovaRecorrencia,
  diaPadrao,
  type EscopoExclusaoOcorrencia,
  HORIZONTE_RECORRENCIA_DIAS,
  type ListaRecorrencias,
  ocorrenciasEntre,
  proximaOcorrencia,
  type Recorrencia,
  type RespostaRecorrencia,
  somarDias,
} from '@mony/shared/recorrencias';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { Rotina } from '../../core/rotinas/rotinas';
import { paraDataDoBanco, paraResposta } from '../transacoes/transacoes.repository';
import {
  type RecorrenciaDoUsuario,
  RecorrenciasRepository,
  type TransacaoBanco,
} from './recorrencias.repository';

/** Recorrência começa no máximo um ano para trás, para não gerar centenas de lançamentos. */
const DIAS_MAXIMOS_NO_PASSADO = 366;
const LOTE_ROTINA = 200;

function data(instante: Date): DataCalendario {
  return instante.toISOString().slice(0, 10);
}

function agendaDe(recorrencia: RecorrenciaDoUsuario): AgendaRecorrencia {
  return {
    frequencia: recorrencia.frequencia,
    dia: recorrencia.dia ?? diaPadrao(recorrencia.frequencia, data(recorrencia.dataInicio)),
    dataInicio: data(recorrencia.dataInicio),
    dataFim: recorrencia.dataFim === null ? null : data(recorrencia.dataFim),
  };
}

/** Próxima data da agenda a partir de `aPartirDe`, ignorando a data final (ver `ponteiro`). */
function proximaSemFim(agenda: AgendaRecorrencia, aPartirDe: DataCalendario): DataCalendario {
  return proximaOcorrencia({ ...agenda, dataFim: null }, aPartirDe) ?? aPartirDe;
}

/**
 * `proxima_geracao` aponta sempre para a próxima data da agenda ainda não gerada, mesmo depois da
 * data final; `ativa` diz se ela ainda vale. Assim, estender a data final retoma de onde parou.
 */
function ponteiro(agenda: AgendaRecorrencia, proxima: DataCalendario) {
  return {
    proximaGeracao: paraDataDoBanco(proxima),
    ativa: agenda.dataFim === null || proxima <= agenda.dataFim,
  };
}

/**
 * Recorrências (RN-043). A rotina de hora em hora e as próprias rotas materializam as ocorrências
 * dos próximos 35 dias como lançamentos pendentes.
 */
@Injectable()
export class RecorrenciasService {
  private readonly log = new Logger(RecorrenciasService.name);

  constructor(
    private readonly repositorio: RecorrenciasRepository,
    private readonly clock: Clock,
  ) {}

  async listar(contexto: Contexto): Promise<ListaRecorrencias> {
    const recorrencias = await this.repositorio.listarAtivas(usuarioDoContexto(contexto));
    return { itens: recorrencias.map(paraRespostaRecorrencia) };
  }

  async buscar(contexto: Contexto, id: string): Promise<Recorrencia> {
    const recorrencia = await this.repositorio.buscar(usuarioDoContexto(contexto), id);
    if (!recorrencia) throw new ErroDominio('NAO_ENCONTRADO');
    return paraRespostaRecorrencia(recorrencia);
  }

  /** Cria a recorrência e já gera as ocorrências até 35 dias à frente. */
  async criar(contexto: Contexto, dados: DadosNovaRecorrencia): Promise<RespostaRecorrencia> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.conferirReferencias(usuarioId, dados.tipo, dados);
    const hoje = await this.hoje(usuarioId);
    if (dados.dataInicio < somarDias(hoje, -DIAS_MAXIMOS_NO_PASSADO)) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'A recorrência pode começar no máximo um ano atrás.',
      });
    }
    const agenda: AgendaRecorrencia = {
      frequencia: dados.frequencia,
      dia: dados.dia ?? diaPadrao(dados.frequencia, dados.dataInicio),
      dataInicio: dados.dataInicio,
      dataFim: dados.dataFim ?? null,
    };
    const primeira = proximaOcorrencia(agenda, dados.dataInicio);
    if (primeira === null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Não há nenhuma ocorrência entre o início e a data final.',
      });
    }

    return this.repositorio.emTransacao(async (tx) => {
      const criada = await this.repositorio.criar(tx, {
        usuarioId,
        tipo: dados.tipo,
        descricao: dados.descricao,
        valor: BigInt(dados.valorCentavos),
        categoriaId: dados.categoriaId,
        formaPagamento: dados.formaPagamento ?? null,
        contaId: dados.contaId ?? null,
        frequencia: agenda.frequencia,
        dia: agenda.dia,
        dataInicio: paraDataDoBanco(agenda.dataInicio),
        dataFim: agenda.dataFim === null ? null : paraDataDoBanco(agenda.dataFim),
        ...ponteiro(agenda, primeira),
      });
      const { recorrencia, ocorrencias } = await this.materializar(tx, criada, hoje);
      return {
        recorrencia: paraRespostaRecorrencia(recorrencia),
        ocorrencias: ocorrencias.map(paraResposta),
      };
    });
  }

  /**
   * RN-043: a mudança vale para a recorrência e para as ocorrências futuras pendentes e não
   * editadas à mão. Mudar frequência ou dia refaz essas ocorrências pela agenda nova; mudar a data
   * final tira as que passaram dela ou retoma a geração.
   */
  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoRecorrencia,
  ): Promise<RespostaRecorrencia> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.repositorio.buscar(usuarioId, id);
    if (!atual) throw new ErroDominio('NAO_ENCONTRADO');
    await this.conferirReferencias(usuarioId, atual.tipo, dados);
    const hoje = await this.hoje(usuarioId);
    const agora = this.clock.agora();

    return this.repositorio.emTransacao(async (tx) => {
      const travada = await this.repositorio.travar(tx, usuarioId, id);
      if (!travada) throw new ErroDominio('NAO_ENCONTRADO');

      const modelo = {
        ...(dados.descricao === undefined ? {} : { descricao: dados.descricao }),
        ...(dados.valorCentavos === undefined ? {} : { valor: BigInt(dados.valorCentavos) }),
        ...(dados.categoriaId === undefined ? {} : { categoriaId: dados.categoriaId }),
        ...(dados.formaPagamento === undefined ? {} : { formaPagamento: dados.formaPagamento }),
        ...(dados.contaId === undefined ? {} : { contaId: dados.contaId }),
      };
      if (Object.keys(modelo).length > 0) {
        await this.repositorio.atualizarOcorrenciasLivres(tx, id, paraDataDoBanco(hoje), modelo);
      }

      const anterior = agendaDe(travada);
      const agenda: AgendaRecorrencia = {
        frequencia: dados.frequencia ?? anterior.frequencia,
        dia:
          dados.dia ??
          (dados.frequencia !== undefined && dados.frequencia !== anterior.frequencia
            ? diaPadrao(dados.frequencia, anterior.dataInicio)
            : anterior.dia),
        dataInicio: anterior.dataInicio,
        dataFim: dados.dataFim === undefined ? anterior.dataFim : dados.dataFim,
      };
      if (agenda.dataFim !== null && agenda.dataFim < agenda.dataInicio) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'A data final vem depois do início.',
        });
      }

      let proxima = data(travada.proximaGeracao);
      if (agenda.frequencia !== anterior.frequencia || agenda.dia !== anterior.dia) {
        // Agenda nova: as ocorrências livres de hoje em diante são refeitas.
        await this.repositorio.excluirOcorrenciasLivres(
          tx,
          id,
          { desde: paraDataDoBanco(hoje) },
          agora,
        );
        proxima = proximaSemFim(agenda, hoje > agenda.dataInicio ? hoje : agenda.dataInicio);
      }
      if (agenda.dataFim !== null) {
        await this.repositorio.excluirOcorrenciasLivres(
          tx,
          id,
          { depoisDe: paraDataDoBanco(agenda.dataFim) },
          agora,
        );
      }

      const atualizada = await this.repositorio.atualizar(tx, id, {
        ...modelo,
        frequencia: agenda.frequencia,
        dia: agenda.dia,
        dataFim: agenda.dataFim === null ? null : paraDataDoBanco(agenda.dataFim),
        ...ponteiro(agenda, proxima),
      });
      const { recorrencia, ocorrencias } = await this.materializar(tx, atualizada, hoje);
      return {
        recorrencia: paraRespostaRecorrencia(recorrencia),
        ocorrencias: ocorrencias.map(paraResposta),
      };
    });
  }

  /**
   * Para a recorrência: as ocorrências livres de hoje em diante saem, as passadas e as editadas à
   * mão ficam.
   */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const hoje = await this.hoje(usuarioId);
    await this.repositorio.emTransacao(async (tx) => {
      const travada = await this.repositorio.travar(tx, usuarioId, id);
      if (!travada) throw new ErroDominio('NAO_ENCONTRADO');
      await this.repositorio.excluirOcorrenciasLivres(
        tx,
        id,
        { desde: paraDataDoBanco(hoje) },
        this.clock.agora(),
      );
      await this.repositorio.atualizar(tx, id, { ativa: false });
    });
  }

  /**
   * RN-043, ao excluir uma ocorrência: "esta e as próximas" exclui a partir dela (pagas ou não) e
   * encerra a recorrência na véspera; "todas" exclui todas e para a recorrência.
   */
  async excluirOcorrencias(
    usuarioId: string,
    recorrenciaId: string,
    dataOcorrencia: DataCalendario,
    escopo: Exclude<EscopoExclusaoOcorrencia, 'esta'>,
  ): Promise<void> {
    await this.repositorio.emTransacao(async (tx) => {
      const travada = await this.repositorio.travar(tx, usuarioId, recorrenciaId);
      if (!travada) throw new ErroDominio('NAO_ENCONTRADO');
      const agora = this.clock.agora();
      if (escopo === 'todas') {
        await this.repositorio.excluirOcorrencias(tx, recorrenciaId, null, agora);
        await this.repositorio.atualizar(tx, recorrenciaId, { ativa: false });
        return;
      }
      await this.repositorio.excluirOcorrencias(
        tx,
        recorrenciaId,
        paraDataDoBanco(dataOcorrencia),
        agora,
      );
      const vespera = somarDias(dataOcorrencia, -1);
      const agenda = { ...agendaDe(travada), dataFim: vespera };
      await this.repositorio.atualizar(tx, recorrenciaId, {
        dataFim: paraDataDoBanco(vespera),
        ...ponteiro(agenda, proximaSemFim(agenda, dataOcorrencia)),
        ...(vespera < agenda.dataInicio ? { ativa: false } : {}),
      });
    });
  }

  /**
   * Rotina (doc 09): a cada hora, gera as ocorrências que entraram na janela de 35 dias, no fuso
   * de cada usuário. Pode rodar de novo sem duplicar: a recorrência fica travada e o ponteiro
   * `proxima_geracao` só anda para a frente.
   */
  @Rotina({ nome: 'gerar-recorrencias', padrao: '30 * * * *' })
  async gerarPendentes(agora: Date): Promise<{ recorrencias: number; ocorrencias: number }> {
    // Folga de um dia para os fusos à frente de UTC; cada recorrência confere no fuso do usuário.
    const ate = paraDataDoBanco(somarDias(data(agora), HORIZONTE_RECORRENCIA_DIAS + 1));
    let depoisDe: string | null = null;
    let recorrencias = 0;
    let ocorrencias = 0;
    for (;;) {
      const lote = await this.repositorio.pendentesDeGeracao(ate, depoisDe, LOTE_ROTINA);
      for (const item of lote) {
        const hoje = dataNoFuso(agora, item.usuario.fusoHorario);
        const geradas = await this.repositorio.emTransacao(async (tx) => {
          const travada = await this.repositorio.travar(tx, item.usuarioId, item.id);
          if (!travada?.ativa) return 0;
          return (await this.materializar(tx, travada, hoje)).ocorrencias.length;
        });
        if (geradas > 0) recorrencias += 1;
        ocorrencias += geradas;
      }
      if (lote.length < LOTE_ROTINA) break;
      depoisDe = lote.at(-1)?.id ?? null;
    }
    if (ocorrencias > 0) {
      this.log.log(`Recorrências: ${String(ocorrencias)} ocorrências em ${String(recorrencias)}`);
    }
    return { recorrencias, ocorrencias };
  }

  /** Gera as ocorrências do ponteiro até hoje + 35 dias e anda o ponteiro. */
  private async materializar(
    tx: TransacaoBanco,
    recorrencia: RecorrenciaDoUsuario,
    hoje: DataCalendario,
  ) {
    if (!recorrencia.ativa) return { recorrencia, ocorrencias: [] };
    const agenda = agendaDe(recorrencia);
    const horizonte = somarDias(hoje, HORIZONTE_RECORRENCIA_DIAS);
    const desde = data(recorrencia.proximaGeracao);
    if (desde > horizonte) return { recorrencia, ocorrencias: [] };
    const datas = ocorrenciasEntre(agenda, desde, horizonte);
    const ocorrencias = await this.repositorio.gerarOcorrencias(
      tx,
      recorrencia,
      datas.map(paraDataDoBanco),
    );
    const atualizada = await this.repositorio.atualizar(
      tx,
      recorrencia.id,
      ponteiro(agenda, proximaSemFim(agenda, somarDias(horizonte, 1))),
    );
    return { recorrencia: atualizada, ocorrencias };
  }

  private async hoje(usuarioId: string): Promise<DataCalendario> {
    return dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
  }

  /** Categoria do usuário e do tipo certo, conta do usuário, sem cartão de crédito (T-040). */
  private async conferirReferencias(
    usuarioId: string,
    tipo: TipoTransacao,
    dados: {
      categoriaId?: string | undefined;
      contaId?: string | null | undefined;
      formaPagamento?: string | undefined;
    },
  ): Promise<void> {
    if (dados.formaPagamento === 'cartao_credito') {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Recorrência no cartão de crédito ainda não pode ser criada.',
      });
    }
    if (dados.categoriaId !== undefined) {
      const categoria = await this.repositorio.categoria(usuarioId, dados.categoriaId);
      if (!categoria)
        throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { categoriaId: dados.categoriaId } });
      if (categoria.tipo !== tipo) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: `Escolha uma categoria de ${tipo}.`,
        });
      }
    }
    if (dados.contaId !== undefined && dados.contaId !== null) {
      if (!(await this.repositorio.contaExiste(usuarioId, dados.contaId))) {
        throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { contaId: dados.contaId } });
      }
    }
  }
}

function paraRespostaRecorrencia(recorrencia: RecorrenciaDoUsuario): Recorrencia {
  const agenda = agendaDe(recorrencia);
  return {
    id: recorrencia.id,
    tipo: recorrencia.tipo,
    descricao: recorrencia.descricao,
    valorCentavos: Number(recorrencia.valor),
    categoriaId: recorrencia.categoriaId,
    formaPagamento: recorrencia.formaPagamento,
    contaId: recorrencia.contaId,
    frequencia: recorrencia.frequencia,
    dia: agenda.dia,
    dataInicio: agenda.dataInicio,
    dataFim: agenda.dataFim,
    proximaGeracao: recorrencia.ativa ? data(recorrencia.proximaGeracao) : null,
    ativa: recorrencia.ativa,
  };
}
