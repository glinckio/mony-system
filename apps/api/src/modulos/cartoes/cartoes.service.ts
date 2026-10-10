import { Injectable } from '@nestjs/common';
import {
  type Cartao,
  type DadosAtualizacaoCartao,
  type DadosNovoCartao,
  type DadosPagamentoFatura,
  type DetalheFatura,
  type DiasDoCartao,
  FAIXAS_ALERTA_PADRAO,
  faturaDaCompra,
  limiteDoCartao,
  type ListaCartoes,
  type ListaFaturas,
  type RespostaPagamentoFatura,
  statusDaFatura,
} from '@mony/shared/cartoes';
import type { Competencia } from '@mony/shared/datas';
import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import type { Impacto } from '@mony/shared/transacoes';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { BarramentoEventos } from '../../core/eventos/barramento-eventos';
import { idDeJob } from '../../core/filas/filas';
import { paraDataDoBanco, paraResposta } from '../transacoes/transacoes.repository';
import { UsuariosService } from '../usuarios/usuarios.service';
import {
  type CartaoDoUsuario,
  CartoesRepository,
  type TransacaoCartoes,
} from './cartoes.repository';
import {
  faturaAindaVazia,
  faturaDestino,
  type FaturaGravada,
  faturaQuitada,
  paraFatura,
  recebeCompra,
} from './dominio/faturas';

/** Evento publicado depois de um pagamento de fatura (alertas: T-080). */
export const EVENTO_FATURA_PAGA = 'fatura.paga';

/** Campos de cartão do Open Finance que vêm do banco (RN-039). */
const CAMPOS_DO_BANCO = [
  'bandeira',
  'final',
  'limiteTotalCentavos',
  'diaFechamento',
  'diaVencimento',
] as const;

/** Cartão travado para uma compra entrar ou sair da fatura. */
export type CartaoTravado = Pick<CartaoDoUsuario, 'id' | 'diaFechamento' | 'diaVencimento'>;

/**
 * Cartões de crédito e faturas (RN-030 a RN-035, RN-038). A compra no cartão é gravada pelas
 * transações, que chamam `travarCartoes`, `faturaParaCompra`, `exigirNaoQuitadas` e `recalcular`
 * dentro da transação de banco delas.
 */
@Injectable()
export class CartoesService {
  constructor(
    private readonly repositorio: CartoesRepository,
    private readonly usuarios: UsuariosService,
    private readonly eventos: BarramentoEventos,
    private readonly clock: Clock,
  ) {}

  async listar(contexto: Contexto): Promise<ListaCartoes> {
    const usuarioId = usuarioDoContexto(contexto);
    const cartoes = await this.repositorio.listar(usuarioId);
    const faturas = await this.repositorio.faturasDosCartoes(
      usuarioId,
      cartoes.map(({ id }) => id),
    );
    const hoje = await this.hoje(usuarioId);
    return {
      itens: cartoes.map((cartao) =>
        montarCartao(
          cartao,
          faturas.filter((fatura) => fatura.cartaoId === cartao.id),
          hoje,
        ),
      ),
    };
  }

  async buscar(contexto: Contexto, id: string): Promise<Cartao> {
    const usuarioId = usuarioDoContexto(contexto);
    return this.montar(usuarioId, await this.exigir(usuarioId, id));
  }

  /** RN-030. O primeiro cartão conclui a etapa `cartoes` do onboarding. */
  async criar(contexto: Contexto, dados: DadosNovoCartao): Promise<Cartao> {
    const usuarioId = usuarioDoContexto(contexto);
    if (dados.contaPagamentoId !== undefined) {
      await this.conferirConta(usuarioId, dados.contaPagamentoId);
    }
    const cartao = await this.repositorio.criar({
      usuarioId,
      nome: dados.nome,
      bandeira: dados.bandeira ?? null,
      final: dados.final ?? null,
      limiteTotal: BigInt(dados.limiteTotalCentavos),
      diaFechamento: dados.diaFechamento,
      diaVencimento: dados.diaVencimento,
      cor: dados.cor,
      faixasAlerta: ordenarFaixas(dados.faixasAlerta ?? FAIXAS_ALERTA_PADRAO),
      contaPagamentoId: dados.contaPagamentoId ?? null,
    });
    await this.usuarios.concluirEtapa(usuarioId, 'cartoes');
    return this.montar(usuarioId, cartao);
  }

  /**
   * Muda só o que veio. Novos dias valem para as faturas que ainda não existem: as criadas
   * mantêm as datas, como no banco, que muda o ciclo a partir do seguinte.
   */
  async atualizar(contexto: Contexto, id: string, dados: DadosAtualizacaoCartao): Promise<Cartao> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.exigir(usuarioId, id);
    if (atual.origem === 'open_finance') {
      const campos = CAMPOS_DO_BANCO.filter((campo) => dados[campo] !== undefined);
      if (campos.length > 0) {
        throw new ErroDominio('CONFLITO', {
          mensagem: 'Limite, dias, bandeira e final de cartão do Open Finance vêm do banco.',
          detalhes: { campos },
        });
      }
    }
    if (dados.contaPagamentoId !== undefined && dados.contaPagamentoId !== null) {
      await this.conferirConta(usuarioId, dados.contaPagamentoId);
    }
    await this.repositorio.emTransacao(async (tx) => {
      // Trava para a mudança de dias não cruzar com uma compra entrando na fatura.
      await this.repositorio.travarCartoes(tx, usuarioId, [id]);
      await this.repositorio.atualizar(tx, id, {
        ...(dados.nome === undefined ? {} : { nome: dados.nome }),
        ...(dados.bandeira === undefined ? {} : { bandeira: dados.bandeira }),
        ...(dados.final === undefined ? {} : { final: dados.final }),
        ...(dados.limiteTotalCentavos === undefined
          ? {}
          : { limiteTotal: BigInt(dados.limiteTotalCentavos) }),
        ...(dados.diaFechamento === undefined ? {} : { diaFechamento: dados.diaFechamento }),
        ...(dados.diaVencimento === undefined ? {} : { diaVencimento: dados.diaVencimento }),
        ...(dados.cor === undefined ? {} : { cor: dados.cor }),
        ...(dados.faixasAlerta === undefined
          ? {}
          : { faixasAlerta: ordenarFaixas(dados.faixasAlerta) }),
        ...(dados.contaPagamentoId === undefined
          ? {}
          : { contaPagamentoId: dados.contaPagamentoId }),
      });
    });
    return this.buscar(contexto, id);
  }

  /**
   * Exclusão lógica. Com saldo em aberto em alguma fatura (inclusive compra futura), o cartão
   * não sai: as compras ficariam pendentes para sempre. Cartão do Open Finance sai desconectando
   * o banco.
   */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.repositorio.emTransacao(async (tx) => {
      const [cartao] = await this.repositorio.travarCartoes(tx, usuarioId, [id]);
      if (!cartao || cartao.excluidoEm !== null) throw new ErroDominio('NAO_ENCONTRADO');
      if (cartao.origem === 'open_finance') {
        throw new ErroDominio('CONFLITO', {
          mensagem: 'Para remover um cartão do Open Finance, desconecte o banco.',
        });
      }
      const faturas = await this.repositorio.faturasDoCartao(tx, id);
      const { limiteUsado } = limiteDoCartao(Number(cartao.limiteTotal), faturas);
      if (limiteUsado > 0) {
        throw new ErroDominio('CONFLITO', {
          mensagem: 'Este cartão tem fatura em aberto. Pague a fatura ou exclua as compras antes.',
          detalhes: { saldoEmAbertoCentavos: limiteUsado },
        });
      }
      await this.repositorio.atualizar(tx, id, { excluidoEm: this.clock.agora() });
    });
  }

  /** Faturas do cartão, da competência mais nova para a mais antiga. */
  async faturas(contexto: Contexto, cartaoId: string): Promise<ListaFaturas> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.exigir(usuarioId, cartaoId);
    const faturas = await this.repositorio.faturasDosCartoes(usuarioId, [cartaoId]);
    const hoje = await this.hoje(usuarioId);
    return { itens: faturas.reverse().map((fatura) => paraFatura(fatura, hoje)) };
  }

  async fatura(contexto: Contexto, id: string): Promise<DetalheFatura> {
    const usuarioId = usuarioDoContexto(contexto);
    const achada = await this.repositorio.fatura(usuarioId, id);
    if (!achada) throw new ErroDominio('NAO_ENCONTRADO');
    const transacoes = await this.repositorio.transacoesDaFatura(usuarioId, id);
    const { id: cartaoId, nome, bandeira, final, cor } = achada.cartao;
    return {
      fatura: paraFatura(achada.fatura, await this.hoje(usuarioId)),
      cartao: { id: cartaoId, nome, bandeira, final, cor },
      transacoes: transacoes.filter(({ natureza }) => natureza === 'normal').map(paraResposta),
      pagamentos: transacoes
        .filter(({ natureza }) => natureza === 'pagamento_fatura')
        .map(paraResposta),
    };
  }

  /**
   * RN-036 e RN-037: registra o pagamento, total ou parcial, como transação `pagamento_fatura`.
   * Ela sai da conta escolhida, mas não é despesa. O pago da fatura é refeito pela soma dos
   * pagamentos, e a fatura quitada deixa as compras pagas. Parcial deixa o restante na mesma
   * fatura, sem juros.
   */
  async pagar(
    contexto: Contexto,
    faturaId: string,
    dados: DadosPagamentoFatura,
  ): Promise<RespostaPagamentoFatura> {
    const usuarioId = usuarioDoContexto(contexto);
    const achada = await this.repositorio.fatura(usuarioId, faturaId);
    if (!achada) throw new ErroDominio('NAO_ENCONTRADO');
    const hoje = await this.hoje(usuarioId);
    const data = dados.data ?? hoje;
    if (data > hoje) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'O pagamento não pode ter data futura.',
        detalhes: { campos: ['data'] },
      });
    }
    const categoriaId = await this.categoriaDoPagamento(usuarioId, dados.categoriaId);
    if (dados.contaId !== undefined && dados.contaId !== null) {
      await this.conferirConta(usuarioId, dados.contaId);
    }
    const contaId = dados.contaId === undefined ? achada.cartao.contaPagamentoId : dados.contaId;

    const transacaoId = await this.repositorio.emTransacao(async (tx) => {
      await this.travarCartoes(tx, usuarioId, { entrada: [achada.cartao.id], saida: [] });
      const { fatura, compras, pagamentos } = await this.repositorio.travarESomar(tx, faturaId);
      const saldo = Number(compras - pagamentos);
      if (saldo <= 0) {
        throw new ErroDominio('CONFLITO', { mensagem: 'Esta fatura não tem saldo a pagar.' });
      }
      const valor = dados.valorCentavos ?? saldo;
      if (valor > saldo) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'O valor passa do saldo da fatura.',
          detalhes: { campos: ['valorCentavos'], saldoCentavos: saldo },
        });
      }
      const id = await this.repositorio.criarPagamento(tx, {
        usuarioId,
        tipo: 'despesa',
        natureza: 'pagamento_fatura',
        descricao: `Pagamento da fatura ${achada.cartao.nome} (${mesEAno(fatura.competencia)})`,
        valor: BigInt(valor),
        data: paraDataDoBanco(data),
        status: 'pago',
        formaPagamento: dados.formaPagamento ?? null,
        origem: contexto.origem === 'mony' ? 'mony' : 'manual',
        categoriaId,
        contaId,
        cartaoId: achada.cartao.id,
        faturaId,
      });
      await this.recalcular(tx, [faturaId], hoje);
      return id;
    });

    await this.eventos.publicar(EVENTO_FATURA_PAGA, { faturaId, transacaoId }, contexto, {
      idUnico: idDeJob('fatura-paga', transacaoId),
    });
    const depois = await this.repositorio.fatura(usuarioId, faturaId);
    const transacao = await this.repositorio.buscarTransacao(usuarioId, transacaoId);
    if (!depois || !transacao) throw new ErroDominio('NAO_ENCONTRADO');
    const impacto = await this.impacto(usuarioId, achada.cartao.id);
    return {
      fatura: paraFatura(depois.fatura, hoje),
      transacao: paraResposta(transacao),
      impacto: impacto === null ? {} : { cartao: impacto },
    };
  }

  /**
   * Trava os cartões das compras que entram e saem de fatura. O cartão onde a compra entra
   * precisa existir e não estar excluído; o de onde ela sai pode estar excluído.
   */
  async travarCartoes(
    tx: TransacaoCartoes,
    usuarioId: string,
    cartoes: { entrada: readonly string[]; saida: readonly string[] },
  ): Promise<Map<string, CartaoTravado>> {
    const travados = await this.repositorio.travarCartoes(tx, usuarioId, [
      ...cartoes.entrada,
      ...cartoes.saida,
    ]);
    const porId = new Map(travados.map((cartao) => [cartao.id, cartao]));
    for (const id of cartoes.entrada) {
      const cartao = porId.get(id);
      if (!cartao || cartao.excluidoEm !== null) {
        throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { cartaoId: id } });
      }
    }
    return porId;
  }

  /**
   * RN-031: a fatura onde entra a compra de `data`, criada se ainda não existe. Fatura fechada e
   * quitada recusa a compra (RN-046). O cartão precisa estar travado (`travarCartoes`).
   */
  async faturaParaCompra(
    tx: TransacaoCartoes,
    usuarioId: string,
    cartao: CartaoTravado,
    data: DataCalendario,
    hoje: DataCalendario,
  ): Promise<string> {
    const dias: DiasDoCartao = cartao;
    const existentes = await this.repositorio.faturasDoCartao(
      tx,
      cartao.id,
      faturaDaCompra(data, dias).competencia,
    );
    const destino = faturaDestino(data, dias, existentes);
    const fatura =
      'existente' in destino
        ? destino.existente
        : await this.repositorio.criarFatura(tx, usuarioId, cartao.id, destino.nova);
    if (!recebeCompra(fatura, hoje)) {
      throw new ErroDominio('TRANSACAO_EM_FATURA_PAGA', {
        mensagem: 'A fatura dessa data já foi paga.',
        detalhes: { faturaId: fatura.id, competencia: fatura.competencia },
      });
    }
    return fatura.id;
  }

  /** RN-046: compra de fatura quitada não muda nem sai. */
  async exigirNaoQuitadas(tx: TransacaoCartoes, faturaIds: readonly string[]): Promise<void> {
    if (faturaIds.length === 0) return;
    exigirNaoQuitadas(await this.repositorio.faturasPorId(tx, faturaIds));
  }

  /**
   * Refaz total, pago e status das faturas depois que compras ou pagamentos entraram, mudaram ou
   * saíram. Trava cada fatura e soma de novo, em vez de somar a diferença, para nunca acumular
   * erro. RN-037: fatura quitada deixa as compras pagas; senão, pendentes.
   */
  async recalcular(
    tx: TransacaoCartoes,
    faturaIds: readonly string[],
    hoje: DataCalendario,
  ): Promise<void> {
    for (const id of [...new Set(faturaIds)].sort()) {
      const { fatura, compras, pagamentos } = await this.repositorio.travarESomar(tx, id);
      const situacao = { ...fatura, valorTotal: Number(compras), valorPago: Number(pagamentos) };
      await this.repositorio.gravarTotais(tx, id, {
        valorTotal: compras,
        valorPago: pagamentos,
        status: statusDaFatura(situacao, hoje),
      });
      await this.repositorio.marcarCompras(tx, id, faturaQuitada(situacao) ? 'pago' : 'pendente');
    }
  }

  /**
   * Quanto do limite o cartão usa depois da compra ("Nubank: 62% do limite usado", doc 05).
   * Cartão excluído não tem impacto: `null`.
   */
  async impacto(
    usuarioId: string,
    cartaoId: string,
  ): Promise<NonNullable<Impacto['cartao']> | null> {
    const cartao = await this.repositorio.buscar(usuarioId, cartaoId);
    if (!cartao) return null;
    const faturas = await this.repositorio.faturasDosCartoes(usuarioId, [cartaoId]);
    return {
      cartaoId,
      percentualUsado: limiteDoCartao(Number(cartao.limiteTotal), faturas).percentualUsado,
    };
  }

  private async montar(usuarioId: string, cartao: CartaoDoUsuario): Promise<Cartao> {
    const faturas = await this.repositorio.faturasDosCartoes(usuarioId, [cartao.id]);
    return montarCartao(cartao, faturas, await this.hoje(usuarioId));
  }

  private async exigir(usuarioId: string, id: string): Promise<CartaoDoUsuario> {
    const cartao = await this.repositorio.buscar(usuarioId, id);
    if (!cartao) throw new ErroDominio('NAO_ENCONTRADO');
    return cartao;
  }

  /**
   * Categoria do pagamento, só para o extrato (RN-037). Sem escolha, a "Contas" padrão; se ela
   * saiu, a categoria de despesa mais antiga (sempre sobra uma, RN-066).
   */
  private async categoriaDoPagamento(
    usuarioId: string,
    escolhida: string | undefined,
  ): Promise<string> {
    if (escolhida !== undefined) {
      const categoria = await this.repositorio.categoria(usuarioId, escolhida);
      if (!categoria)
        throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { categoriaId: escolhida } });
      if (categoria.tipo !== 'despesa') {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'Escolha uma categoria de despesa.',
          detalhes: { categoriaId: escolhida },
        });
      }
      return escolhida;
    }
    const categorias = await this.repositorio.categoriasDeDespesa(usuarioId);
    const padrao =
      categorias.find((categoria) => categoria.padrao && categoria.icone === 'contas') ??
      categorias[0];
    if (!padrao) throw new ErroDominio('CONFLITO', { mensagem: 'Crie uma categoria de despesa.' });
    return padrao.id;
  }

  private async conferirConta(usuarioId: string, contaId: string): Promise<void> {
    if (!(await this.repositorio.contaExiste(usuarioId, contaId))) {
      throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { contaPagamentoId: contaId } });
    }
  }

  private async hoje(usuarioId: string): Promise<DataCalendario> {
    return dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
  }
}

/** `2026-11-01` → `11/2026`. */
function mesEAno(competencia: Competencia): string {
  return `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
}

function ordenarFaixas(faixas: readonly number[]): number[] {
  return [...new Set(faixas)].sort((a, b) => a - b);
}

function exigirNaoQuitadas(faturas: readonly FaturaGravada[]): void {
  const quitada = faturas.find(faturaQuitada);
  if (quitada) {
    throw new ErroDominio('TRANSACAO_EM_FATURA_PAGA', {
      detalhes: { faturaId: quitada.id, competencia: quitada.competencia },
    });
  }
}

/** RN-034: limite pelas faturas; a fatura atual é a que recebe uma compra feita hoje. */
function montarCartao(
  cartao: CartaoDoUsuario,
  faturas: readonly FaturaGravada[],
  hoje: DataCalendario,
): Cartao {
  const limite = limiteDoCartao(Number(cartao.limiteTotal), faturas);
  const destino = faturaDestino(hoje, cartao, faturas);
  return {
    id: cartao.id,
    nome: cartao.nome,
    bandeira: cartao.bandeira,
    final: cartao.final,
    cor: cartao.cor,
    diaFechamento: cartao.diaFechamento,
    diaVencimento: cartao.diaVencimento,
    faixasAlerta: cartao.faixasAlerta,
    origem: cartao.origem,
    contaPagamentoId: cartao.contaPagamentoId,
    limiteTotalCentavos: limite.limiteTotal,
    limiteUsadoCentavos: limite.limiteUsado,
    limiteDisponivelCentavos: limite.limiteDisponivel,
    percentualUsado: limite.percentualUsado,
    faturaAtual:
      'existente' in destino
        ? paraFatura(destino.existente, hoje)
        : faturaAindaVazia(cartao.id, destino.nova, hoje),
  };
}
