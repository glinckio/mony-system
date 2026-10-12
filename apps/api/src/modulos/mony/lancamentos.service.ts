import { Injectable } from '@nestjs/common';
import { formatarCentavos } from '@mony/shared/dinheiro';
import {
  type ComponenteMony,
  type OpcaoBotao,
  PRAZO_DESFAZER_MS,
  type RespostaAcaoMony,
  type ResumoLancamento,
} from '@mony/shared/mony';
import type { DadosNovoParcelamento } from '@mony/shared/parcelamentos';
import type { DadosNovaTransacao, Transacao } from '@mony/shared/transacoes';

import { Clock } from '../../core/clock/clock';
import type { Contexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { CartoesService } from '../cartoes/cartoes.service';
import { CategoriasService } from '../categorias/categorias.service';
import { ParcelamentosService } from '../parcelamentos/parcelamentos.service';
import { TransacoesService } from '../transacoes/transacoes.service';
import { PreferenciasService } from './preferencias.service';

const reais = (centavos: number) => formatarCentavos(centavos);

/** O que a Mony gravou: o cartão de resumo com [Desfazer] e o id do lançamento. */
export interface Gravado {
  resumo: ComponenteMony;
  lancamento: ResumoLancamento;
}

/**
 * Lançamentos feitos pela Mony (doc 08), pelo rascunho ou pelas ferramentas: grava pelos Services
 * com origem `mony`, monta o cartão de resumo com [Desfazer] (RN-082), desfaz em até 24 h, e exclui
 * e paga fatura só depois da confirmação por botão (RN-092).
 */
@Injectable()
export class LancamentosMony {
  constructor(
    private readonly transacoes: TransacoesService,
    private readonly parcelamentos: ParcelamentosService,
    private readonly categorias: CategoriasService,
    private readonly cartoes: CartoesService,
    private readonly preferencias: PreferenciasService,
    private readonly clock: Clock,
  ) {}

  /** Grava a despesa ou receita (RN-082: sem perguntas, quando os dados estão completos). */
  async registrarTransacao(contexto: Contexto, dados: DadosNovaTransacao): Promise<Gravado> {
    const { transacao } = await this.transacoes.registrar({ ...contexto, origem: 'mony' }, dados);
    await this.preferencias.aprender(contexto, transacao.descricao, {
      categoriaId: transacao.categoriaId,
      cartaoId: transacao.cartaoId,
      formaPagamento: transacao.formaPagamento,
    });
    return this.resumoDaTransacao(contexto, transacao, { comDesfazer: true });
  }

  /** Grava o parcelamento (compra no cartão ou dívida) e o resumo com a primeira parcela. */
  async registrarParcelamento(contexto: Contexto, dados: DadosNovoParcelamento): Promise<Gravado> {
    const { parcelamento } = await this.parcelamentos.registrar(
      { ...contexto, origem: 'mony' },
      dados,
    );
    const [primeira] = parcelamento.parcelas;
    await this.preferencias.aprender(contexto, parcelamento.nome, {
      categoriaId: parcelamento.categoriaId,
      cartaoId: parcelamento.cartaoId,
      formaPagamento: parcelamento.cartaoId ? 'cartao_credito' : (dados.formaPagamento ?? 'boleto'),
    });
    const [categoria, cartao] = await Promise.all([
      this.categorias.buscar(contexto, parcelamento.categoriaId),
      parcelamento.cartaoId ? this.cartoes.buscar(contexto, parcelamento.cartaoId) : null,
    ]);
    const lancamento: ResumoLancamento = {
      transacaoId: primeira?.transacaoId ?? null,
      parcelamentoId: parcelamento.id,
      tipo: 'despesa',
      descricao: parcelamento.nome,
      valorCentavos: parcelamento.valorTotalCentavos,
      data: parcelamento.dataInicio,
      categoria: categoria.nome,
      formaPagamento: cartao ? 'cartao_credito' : (dados.formaPagamento ?? 'boleto'),
      cartao: cartao?.nome ?? null,
      parcelas: parcelamento.totalParcelas,
      valorParcelaCentavos: primeira?.valorCentavos ?? null,
    };
    return {
      lancamento,
      resumo: {
        tipo: 'resumo',
        lancamento,
        opcoes: [desfazer('parcelamento', parcelamento.id)],
      },
    };
  }

  /** O cartão de resumo de uma transação; o [Desfazer] só para o que acabou de ser gravado. */
  async resumoDaTransacao(
    contexto: Contexto,
    transacao: Transacao,
    opcoes: { comDesfazer: boolean },
  ): Promise<Gravado> {
    const [categoria, cartao] = await Promise.all([
      this.categorias.buscar(contexto, transacao.categoriaId),
      transacao.cartaoId ? this.cartoes.buscar(contexto, transacao.cartaoId) : null,
    ]);
    const lancamento: ResumoLancamento = {
      transacaoId: transacao.id,
      parcelamentoId: transacao.parcelamentoId,
      tipo: transacao.tipo,
      descricao: transacao.descricao,
      valorCentavos: transacao.valorCentavos,
      data: transacao.data,
      categoria: categoria.nome,
      formaPagamento: transacao.formaPagamento,
      cartao: cartao?.nome ?? null,
      parcelas: null,
      valorParcelaCentavos: null,
    };
    return {
      lancamento,
      resumo: {
        tipo: 'resumo',
        lancamento,
        opcoes: opcoes.comDesfazer ? [desfazer('transacao', transacao.id)] : [],
      },
    };
  }

  /**
   * RN-082: [Desfazer] tira o que a Mony gravou, em até 24 horas. Só vale para lançamento de origem
   * `mony`; parcelamento sai inteiro (cancelado).
   */
  async desfazer(
    contexto: Contexto,
    alvo: 'transacao' | 'parcelamento',
    id: string,
  ): Promise<RespostaAcaoMony> {
    if (alvo === 'parcelamento') {
      const parcelamento = await this.parcelamentos.buscar(contexto, id);
      const primeira = parcelamento.parcelas.find(({ transacaoId }) => transacaoId !== null);
      if (primeira?.transacaoId) {
        this.conferirDesfazer(await this.transacoes.buscar(contexto, primeira.transacaoId));
      }
      await this.parcelamentos.cancelar(contexto, id);
      return {
        texto: `Pronto, desfiz: ${parcelamento.nome} em ${String(parcelamento.totalParcelas)}x saiu dos seus lançamentos.`,
        componente: null,
        transacaoId: null,
      };
    }
    const transacao = await this.transacoes.buscar(contexto, id);
    this.conferirDesfazer(transacao);
    if (transacao.parcelamentoId) {
      return this.desfazer(contexto, 'parcelamento', transacao.parcelamentoId);
    }
    await this.transacoes.excluir(contexto, id);
    return {
      texto: `Pronto, desfiz: ${transacao.descricao} (${reais(transacao.valorCentavos)}) saiu dos seus lançamentos.`,
      componente: null,
      transacaoId: null,
    };
  }

  /** RN-092: os botões que confirmam a exclusão pedida à Mony. Não exclui nada. */
  async pedirExclusao(contexto: Contexto, transacaoId: string): Promise<ComponenteMony> {
    const transacao = await this.transacoes.buscar(contexto, transacaoId);
    return {
      tipo: 'botoes',
      opcoes: [
        {
          id: 'excluir',
          rotulo: `Excluir ${transacao.descricao}`,
          acao: { tipo: 'excluir_transacao', transacaoId: transacao.id },
        },
        { id: 'cancelar', rotulo: 'Cancelar', acao: { tipo: 'cancelar' } },
      ],
    };
  }

  /** RN-092: a exclusão confirmada pelo botão. */
  async excluir(contexto: Contexto, transacaoId: string): Promise<RespostaAcaoMony> {
    const transacao = await this.transacoes.buscar(contexto, transacaoId);
    await this.transacoes.excluir({ ...contexto, origem: 'mony' }, transacaoId);
    return {
      texto: `Pronto, excluí ${transacao.descricao} (${reais(transacao.valorCentavos)}).`,
      componente: null,
      transacaoId: null,
    };
  }

  /**
   * RN-092: os botões que confirmam o pagamento da fatura, no valor pedido (sem ele, o que falta
   * pagar). Não paga nada.
   */
  async pedirPagamento(
    contexto: Contexto,
    faturaId: string,
    valorCentavos: number | undefined,
  ): Promise<{ componente: ComponenteMony; valorCentavos: number; cartao: string }> {
    const { fatura, cartao } = await this.cartoes.fatura(contexto, faturaId);
    if (fatura.saldoCentavos <= 0) {
      throw new ErroDominio('CONFLITO', { mensagem: 'Esta fatura já está paga.' });
    }
    const valor = valorCentavos ?? fatura.saldoCentavos;
    if (valor > fatura.saldoCentavos) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: `O valor passa do que falta pagar (${reais(fatura.saldoCentavos)}).`,
      });
    }
    return {
      valorCentavos: valor,
      cartao: cartao.nome,
      componente: {
        tipo: 'botoes',
        opcoes: [
          {
            id: 'pagar',
            rotulo: `Pagar ${reais(valor)}`,
            acao: { tipo: 'pagar_fatura', faturaId, valorCentavos: valor },
          },
          { id: 'cancelar', rotulo: 'Cancelar', acao: { tipo: 'cancelar' } },
        ],
      },
    };
  }

  /** RN-092: o pagamento confirmado pelo botão (RN-036: total ou parcial), hoje. */
  async pagarFatura(
    contexto: Contexto,
    faturaId: string,
    valorCentavos: number,
  ): Promise<RespostaAcaoMony> {
    const { cartao } = await this.cartoes.fatura(contexto, faturaId);
    const { fatura, transacao } = await this.cartoes.pagar(
      { ...contexto, origem: 'mony' },
      faturaId,
      { valorCentavos },
    );
    const restante =
      fatura.saldoCentavos > 0 ? ` Ainda faltam ${reais(fatura.saldoCentavos)} nessa fatura.` : '';
    return {
      texto: `Pronto, registrei o pagamento de ${reais(valorCentavos)} da fatura do ${cartao.nome}.${restante}`,
      componente: null,
      transacaoId: transacao.id,
    };
  }

  private conferirDesfazer(transacao: Transacao): void {
    if (transacao.origem !== 'mony') {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Só dá para desfazer o que a Mony lançou.',
      });
    }
    const gravadaEm = new Date(transacao.criadoEm).getTime();
    if (this.clock.agora().getTime() - gravadaEm > PRAZO_DESFAZER_MS) {
      throw new ErroDominio('DESFAZER_EXPIRADO');
    }
  }
}

function desfazer(alvo: 'transacao' | 'parcelamento', id: string): OpcaoBotao {
  return { id: 'desfazer', rotulo: 'Desfazer', acao: { tipo: 'desfazer', alvo, id } };
}
