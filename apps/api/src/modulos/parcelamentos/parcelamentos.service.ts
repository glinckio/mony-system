import { Injectable } from '@nestjs/common';
import { faturaDaCompetencia, faturaDaCompra, somarCompetencias } from '@mony/shared/cartoes';
import { type DataCalendario, dataNoFuso, somarMeses } from '@mony/shared/datas';
import type { StatusParcelamento, TipoParcelamento } from '@mony/shared/enums';
import {
  type DadosAtualizacaoParcelamento,
  type DadosNovoParcelamento,
  type DadosPagamentoParcela,
  type DadosSimulacaoParcelamento,
  type DetalheParcelamento,
  type LinhaParcela,
  type ListaParcelamentos,
  type Parcela,
  type Parcelamento,
  type RespostaParcela,
  type RespostaParcelamento,
  type ResultadoSimulacao,
  statusDaParcela,
  statusDoParcelamento,
  valoresDasParcelas,
  vencimentoDaParcela,
} from '@mony/shared/parcelamentos';
import type { Impacto } from '@mony/shared/transacoes';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { BarramentoEventos } from '../../core/eventos/barramento-eventos';
import { idDeJob } from '../../core/filas/filas';
import { CartoesService } from '../cartoes/cartoes.service';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';
import {
  type ParcelamentoDoUsuario,
  ParcelamentosRepository,
  type TransacaoParcelamentos,
} from './parcelamentos.repository';

/** Evento publicado depois que um parcelamento é gravado (alertas de limite: T-080). */
export const EVENTO_PARCELAMENTO_REGISTRADO = 'parcelamento.registrado';

type ParcelaDoUsuario = ParcelamentoDoUsuario['parcelas'][number];

/**
 * Parcelamentos e dívidas (RN-050 a RN-055). Cada parcela tem uma despesa pendente. A da compra
 * no cartão cai na fatura da competência dela e é paga pelo pagamento da fatura; a da dívida é
 * paga aqui.
 */
@Injectable()
export class ParcelamentosService {
  constructor(
    private readonly repositorio: ParcelamentosRepository,
    private readonly cartoes: CartoesService,
    private readonly eventos: BarramentoEventos,
    private readonly clock: Clock,
  ) {}

  /** RN-055: com o progresso de cada um. `status` filtra pelo status do dia de hoje. */
  async listar(
    contexto: Contexto,
    filtro: { tipo?: TipoParcelamento | undefined; status?: StatusParcelamento | undefined },
  ): Promise<ListaParcelamentos> {
    const usuarioId = usuarioDoContexto(contexto);
    const hoje = await this.hoje(usuarioId);
    const itens = (await this.repositorio.listar(usuarioId, filtro.tipo)).map((parcelamento) =>
      resumo(parcelamento, hoje),
    );
    return {
      itens: filtro.status === undefined ? itens : itens.filter((p) => p.status === filtro.status),
    };
  }

  async buscar(contexto: Contexto, id: string): Promise<DetalheParcelamento> {
    const usuarioId = usuarioDoContexto(contexto);
    const parcelamento = await this.repositorio.buscar(usuarioId, id);
    if (!parcelamento) throw new ErroDominio('NAO_ENCONTRADO');
    return detalhe(parcelamento, await this.hoje(usuarioId));
  }

  /** RN-052: a tabela sem gravar. Com cartão, os vencimentos são os das faturas. */
  async simular(
    contexto: Contexto,
    dados: DadosSimulacaoParcelamento,
  ): Promise<ResultadoSimulacao> {
    const usuarioId = usuarioDoContexto(contexto);
    const data = dados.dataInicio ?? (await this.hoje(usuarioId));
    const linhas = valoresDasParcelas(
      dados.valorCentavos,
      dados.totalParcelas,
      dados.taxaJurosMensal,
    );
    let vencimentos = linhas.map(({ numero }) => vencimentoDaParcela(data, numero));
    if (dados.cartaoId !== undefined) {
      const dias = await this.cartoes.diasDoCartao(usuarioId, dados.cartaoId);
      const primeira = faturaDaCompra(data, dias).competencia;
      vencimentos = linhas.map(
        (_, indice) =>
          faturaDaCompetencia(somarCompetencias(primeira, indice), dias).dataVencimento,
      );
    }
    return {
      ...totais(linhas),
      parcelas: linhas.map((linha, indice) => ({
        ...linha,
        vencimento: vencimentos[indice] ?? data,
      })),
    };
  }

  /**
   * RN-050 a RN-052. Grava o parcelamento, as parcelas e uma despesa pendente para cada uma, em
   * uma transação de banco. Compra no cartão: a parcela `k` entra na fatura da competência da
   * primeira + (k − 1) meses, e a despesa tem a data da compra + (k − 1) meses. Dívida: a
   * parcela `k` vence k − 1 meses depois da primeira.
   */
  async registrar(contexto: Contexto, dados: DadosNovoParcelamento): Promise<RespostaParcelamento> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.conferirCategoria(usuarioId, dados.categoriaId);
    if (dados.contaId !== undefined) await this.conferirConta(usuarioId, dados.contaId);
    const hoje = await this.hoje(usuarioId);
    const data = dados.dataInicio ?? hoje;
    const taxa = dados.taxaJurosMensal === 0 ? undefined : dados.taxaJurosMensal;
    const linhas = valoresDasParcelas(dados.valorCentavos, dados.totalParcelas, taxa);
    const { valorTotalCentavos } = totais(linhas);
    const cartaoId = dados.tipo === 'compra_cartao' ? (dados.cartaoId ?? null) : null;

    const id = await this.repositorio.emTransacao(async (tx) => {
      const faturas =
        cartaoId === null
          ? null
          : await this.faturasDaCompra(tx, usuarioId, cartaoId, data, linhas.length, hoje);
      const { id: parcelamentoId } = await this.repositorio.criar(tx, {
        usuarioId,
        nome: dados.nome,
        tipo: dados.tipo,
        valorTotal: BigInt(valorTotalCentavos),
        valorFinanciado: taxa === undefined ? null : BigInt(dados.valorCentavos),
        totalParcelas: dados.totalParcelas,
        taxaJuros: taxa === undefined ? null : (taxa / 100).toFixed(6),
        dataInicio: paraDataDoBanco(data),
        observacao: dados.observacao ?? null,
        categoriaId: dados.categoriaId,
        cartaoId,
      });
      await this.repositorio.criarParcelas(
        tx,
        parcelamentoId,
        linhas.map(({ numero, valorCentavos }, indice) => {
          const fatura = faturas?.[indice] ?? null;
          const vencimento = fatura?.dataVencimento ?? vencimentoDaParcela(data, numero);
          return {
            parcela: {
              usuarioId,
              numero,
              valor: BigInt(valorCentavos),
              vencimento: paraDataDoBanco(vencimento),
              faturaId: fatura?.id ?? null,
            },
            transacao: {
              usuarioId,
              tipo: 'despesa',
              descricao: `${dados.nome} (${String(numero)}/${String(dados.totalParcelas)})`,
              valor: BigInt(valorCentavos),
              data: paraDataDoBanco(fatura === null ? vencimento : somarMeses(data, numero - 1)),
              status: 'pendente',
              formaPagamento:
                fatura === null ? (dados.formaPagamento ?? 'boleto') : 'cartao_credito',
              origem: contexto.origem === 'mony' ? 'mony' : 'manual',
              categoriaId: dados.categoriaId,
              contaId: dados.contaId ?? null,
              cartaoId,
              faturaId: fatura?.id ?? null,
            },
          };
        }),
      );
      if (faturas !== null) {
        await this.cartoes.recalcular(
          tx,
          faturas.map((fatura) => fatura.id),
          hoje,
        );
      }
      return parcelamentoId;
    });

    await this.eventos.publicar(EVENTO_PARCELAMENTO_REGISTRADO, { parcelamentoId: id }, contexto, {
      idUnico: idDeJob('parcelamento-registrado', id),
    });
    return {
      parcelamento: await this.buscar(contexto, id),
      impacto: await this.impacto(usuarioId, cartaoId),
    };
  }

  /** Nome, categoria e observação; nome e categoria passam para as despesas das parcelas. */
  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoParcelamento,
  ): Promise<DetalheParcelamento> {
    const usuarioId = usuarioDoContexto(contexto);
    if (dados.categoriaId !== undefined) await this.conferirCategoria(usuarioId, dados.categoriaId);
    await this.repositorio.emTransacao(async (tx) => {
      const atual = await this.repositorio.travar(tx, usuarioId, id);
      if (!atual) throw new ErroDominio('NAO_ENCONTRADO');
      await this.repositorio.atualizar(tx, id, {
        ...(dados.nome === undefined ? {} : { nome: dados.nome }),
        ...(dados.categoriaId === undefined ? {} : { categoriaId: dados.categoriaId }),
        ...(dados.observacao === undefined ? {} : { observacao: dados.observacao }),
      });
      if (dados.nome !== undefined && dados.nome !== atual.nome) {
        await this.repositorio.renomearTransacoes(tx, id, dados.nome, atual.totalParcelas);
      }
      if (dados.categoriaId !== undefined) {
        await this.repositorio.mudarCategoriaDasTransacoes(tx, id, dados.categoriaId);
      }
    });
    return this.buscar(contexto, id);
  }

  /**
   * RN-054: cancelar tira as parcelas futuras ainda não pagas. Na dívida, as que vencem depois de
   * hoje; no cartão, as de faturas que ainda não fecharam. As vencidas, e as de fatura fechada,
   * continuam devidas. Cancelar de novo não faz nada.
   */
  async cancelar(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const hoje = await this.hoje(usuarioId);
    await this.repositorio.emTransacao(async (tx) => {
      const atual = await this.repositorio.travar(tx, usuarioId, id);
      if (!atual) throw new ErroDominio('NAO_ENCONTRADO');
      if (atual.status === 'cancelada') return;
      let futuras = atual.parcelas.filter(
        (parcela) => parcela.status !== 'pago' && diaDoBanco(parcela.vencimento) > hoje,
      );
      if (atual.cartaoId !== null) {
        await this.cartoes.travarCartoes(tx, usuarioId, { entrada: [], saida: [atual.cartaoId] });
        const abertas = await this.cartoes.faturasAbertas(
          tx,
          atual.parcelas.flatMap(({ faturaId }) => (faturaId === null ? [] : [faturaId])),
          hoje,
        );
        futuras = atual.parcelas.filter(
          (parcela) =>
            parcela.status !== 'pago' && parcela.faturaId !== null && abertas.has(parcela.faturaId),
        );
      }
      await this.repositorio.removerParcelas(tx, futuras, this.clock.agora());
      await this.repositorio.atualizar(tx, id, { status: 'cancelada' });
      const faturaIds = futuras.flatMap(({ faturaId }) => (faturaId === null ? [] : [faturaId]));
      if (faturaIds.length > 0) await this.cartoes.recalcular(tx, faturaIds, hoje);
    });
  }

  /**
   * RN-053: pagar a parcela da dívida marca a parcela e a despesa dela como pagas. Parcela de
   * cartão é paga pela fatura. Pagar de novo devolve o mesmo resultado.
   */
  async pagarParcela(
    contexto: Contexto,
    parcelaId: string,
    dados: DadosPagamentoParcela,
  ): Promise<RespostaParcela> {
    const usuarioId = usuarioDoContexto(contexto);
    if (dados.contaId !== undefined && dados.contaId !== null) {
      await this.conferirConta(usuarioId, dados.contaId);
    }
    return this.marcarParcela(usuarioId, parcelaId, { pago: true, contaId: dados.contaId });
  }

  /** RN-053: desfazer volta a parcela e a despesa dela para pendente. */
  async desfazerParcela(contexto: Contexto, parcelaId: string): Promise<RespostaParcela> {
    return this.marcarParcela(usuarioDoContexto(contexto), parcelaId, { pago: false });
  }

  private async marcarParcela(
    usuarioId: string,
    parcelaId: string,
    dados: { pago: boolean; contaId?: string | null | undefined },
  ): Promise<RespostaParcela> {
    const achada = await this.repositorio.buscarParcela(usuarioId, parcelaId);
    if (!achada) throw new ErroDominio('NAO_ENCONTRADO');
    if (achada.parcelamento.tipo === 'compra_cartao') {
      throw new ErroDominio('PARCELA_PAGA_PELA_FATURA');
    }
    const hoje = await this.hoje(usuarioId);
    const parcelamentoId = achada.parcelamento.id;
    await this.repositorio.emTransacao(async (tx) => {
      const atual = await this.repositorio.travar(tx, usuarioId, parcelamentoId);
      const parcela = atual?.parcelas.find(({ id }) => id === parcelaId);
      if (!atual || !parcela) throw new ErroDominio('NAO_ENCONTRADO');
      if ((parcela.status === 'pago') === dados.pago) return;
      await this.repositorio.marcarParcela(tx, parcela, {
        pago: dados.pago,
        agora: this.clock.agora(),
        ...(dados.contaId === undefined ? {} : { contaId: dados.contaId }),
      });
      if (atual.status !== 'cancelada') {
        const todasPagas = atual.parcelas.every(({ id, status }) =>
          id === parcelaId ? dados.pago : status === 'pago',
        );
        await this.repositorio.atualizar(tx, parcelamentoId, {
          status: todasPagas ? 'quitada' : 'ativa',
        });
      }
    });
    const parcelamento = await this.repositorio.buscar(usuarioId, parcelamentoId);
    const parcela = parcelamento?.parcelas.find(({ id }) => id === parcelaId);
    if (!parcelamento || !parcela) throw new ErroDominio('NAO_ENCONTRADO');
    return { parcela: paraParcela(parcela, hoje), parcelamento: resumo(parcelamento, hoje) };
  }

  /** Trava o cartão e devolve as faturas das parcelas da compra. */
  private async faturasDaCompra(
    tx: TransacaoParcelamentos,
    usuarioId: string,
    cartaoId: string,
    data: DataCalendario,
    quantidade: number,
    hoje: DataCalendario,
  ) {
    const travados = await this.cartoes.travarCartoes(tx, usuarioId, {
      entrada: [cartaoId],
      saida: [],
    });
    const cartao = travados.get(cartaoId);
    if (!cartao) throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { cartaoId } });
    return this.cartoes.faturasParaParcelas(tx, usuarioId, cartao, data, quantidade, hoje);
  }

  private async impacto(usuarioId: string, cartaoId: string | null): Promise<Impacto> {
    const cartao = cartaoId === null ? null : await this.cartoes.impacto(usuarioId, cartaoId);
    return cartao === null ? {} : { cartao };
  }

  private async conferirCategoria(usuarioId: string, categoriaId: string): Promise<void> {
    const categoria = await this.repositorio.categoria(usuarioId, categoriaId);
    if (!categoria) throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { categoriaId } });
    if (categoria.tipo !== 'despesa') {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Escolha uma categoria de despesa.',
        detalhes: { categoriaId },
      });
    }
  }

  private async conferirConta(usuarioId: string, contaId: string): Promise<void> {
    if (!(await this.repositorio.contaExiste(usuarioId, contaId))) {
      throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { contaId } });
    }
  }

  private async hoje(usuarioId: string): Promise<DataCalendario> {
    return dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
  }
}

function diaDoBanco(data: Date): DataCalendario {
  return data.toISOString().slice(0, 10);
}

function totais(linhas: readonly LinhaParcela[]) {
  const soma = (campo: 'valorCentavos' | 'jurosCentavos' | 'amortizacaoCentavos') =>
    linhas.reduce((total, linha) => total + linha[campo], 0);
  return {
    valorFinanciadoCentavos: soma('amortizacaoCentavos'),
    valorTotalCentavos: soma('valorCentavos'),
    jurosTotalCentavos: soma('jurosCentavos'),
  };
}

function paraParcela(parcela: ParcelaDoUsuario, hoje: DataCalendario): Parcela {
  const vencimento = diaDoBanco(parcela.vencimento);
  return {
    id: parcela.id,
    numero: parcela.numero,
    valorCentavos: Number(parcela.valor),
    vencimento,
    status: statusDaParcela({ status: parcela.status, vencimento }, hoje),
    pagoEm: parcela.pagoEm?.toISOString() ?? null,
    transacaoId: parcela.transacaoId,
    faturaId: parcela.faturaId,
  };
}

/** Parcelamento → contrato, com status (RN-054) e progresso (RN-055) do dia de hoje. */
function resumo(parcelamento: ParcelamentoDoUsuario, hoje: DataCalendario): Parcelamento {
  const parcelas = parcelamento.parcelas.map((parcela) => paraParcela(parcela, hoje));
  const pagas = parcelas.filter(({ status }) => status === 'pago');
  const somar = (lista: readonly Parcela[]) =>
    lista.reduce((total, { valorCentavos }) => total + valorCentavos, 0);
  return {
    id: parcelamento.id,
    nome: parcelamento.nome,
    tipo: parcelamento.tipo,
    status: statusDoParcelamento(parcelamento.status === 'cancelada', parcelas, hoje),
    valorTotalCentavos: Number(parcelamento.valorTotal),
    valorFinanciadoCentavos:
      parcelamento.valorFinanciado === null ? null : Number(parcelamento.valorFinanciado),
    totalParcelas: parcelamento.totalParcelas,
    taxaJurosMensal:
      parcelamento.taxaJuros === null ? null : parcelamento.taxaJuros.mul(100).toNumber(),
    dataInicio: diaDoBanco(parcelamento.dataInicio),
    observacao: parcelamento.observacao,
    categoriaId: parcelamento.categoriaId,
    cartaoId: parcelamento.cartaoId,
    progresso: {
      parcelasPagas: pagas.length,
      parcelas: parcelas.length,
      valorPagoCentavos: somar(pagas),
      valorRestanteCentavos: somar(parcelas) - somar(pagas),
    },
    proximaParcela: parcelas.find(({ status }) => status !== 'pago') ?? null,
  };
}

function detalhe(parcelamento: ParcelamentoDoUsuario, hoje: DataCalendario): DetalheParcelamento {
  return {
    ...resumo(parcelamento, hoje),
    parcelas: parcelamento.parcelas.map((parcela) => paraParcela(parcela, hoje)),
  };
}
