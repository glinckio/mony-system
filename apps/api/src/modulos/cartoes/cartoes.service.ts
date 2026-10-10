import { Injectable } from '@nestjs/common';
import {
  type Cartao,
  type DadosAtualizacaoCartao,
  type DadosNovoCartao,
  type DetalheFatura,
  type DiasDoCartao,
  FAIXAS_ALERTA_PADRAO,
  faturaDaCompra,
  limiteDoCartao,
  type ListaCartoes,
  type ListaFaturas,
  statusDaFatura,
} from '@mony/shared/cartoes';
import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import type { Impacto } from '@mony/shared/transacoes';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { paraResposta } from '../transacoes/transacoes.repository';
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
} from './dominio/faturas';

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
    return {
      fatura: paraFatura(achada.fatura, await this.hoje(usuarioId)),
      cartao: achada.cartao,
      transacoes: transacoes.map(paraResposta),
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
   * RN-031: a fatura onde entra a compra de `data`, criada se ainda não existe. Fatura quitada
   * recusa a compra (RN-046). O cartão precisa estar travado (`travarCartoes`).
   */
  async faturaParaCompra(
    tx: TransacaoCartoes,
    usuarioId: string,
    cartao: CartaoTravado,
    data: DataCalendario,
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
    exigirNaoQuitadas([fatura]);
    return fatura.id;
  }

  /** RN-046: compra de fatura quitada não muda nem sai. */
  async exigirNaoQuitadas(tx: TransacaoCartoes, faturaIds: readonly string[]): Promise<void> {
    if (faturaIds.length === 0) return;
    exigirNaoQuitadas(await this.repositorio.faturasPorId(tx, faturaIds));
  }

  /**
   * Refaz total e status das faturas depois que compras entraram, mudaram ou saíram. Trava cada
   * fatura e soma as compras de novo, em vez de somar a diferença, para nunca acumular erro.
   */
  async recalcular(
    tx: TransacaoCartoes,
    faturaIds: readonly string[],
    hoje: DataCalendario,
  ): Promise<void> {
    for (const id of [...new Set(faturaIds)].sort()) {
      const { fatura, soma } = await this.repositorio.travarESomar(tx, id);
      await this.repositorio.gravarTotal(tx, id, {
        valorTotal: soma,
        status: statusDaFatura({ ...fatura, valorTotal: Number(soma) }, hoje),
      });
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

  private async conferirConta(usuarioId: string, contaId: string): Promise<void> {
    if (!(await this.repositorio.contaExiste(usuarioId, contaId))) {
      throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { contaPagamentoId: contaId } });
    }
  }

  private async hoje(usuarioId: string): Promise<DataCalendario> {
    return dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
  }
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
