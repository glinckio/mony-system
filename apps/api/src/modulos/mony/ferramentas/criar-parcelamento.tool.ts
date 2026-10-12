import { Injectable } from '@nestjs/common';
import { FORMAS_PAGAMENTO_FATURA } from '@mony/shared/cartoes';
import {
  esquemaNovoParcelamento,
  MAXIMO_PARCELAS,
  TAXA_MAXIMA_PERCENTUAL,
} from '@mony/shared/parcelamentos';
import { TIPOS_PARCELAMENTO } from '@mony/shared/enums';
import { z } from 'zod';

import { ErroDominio } from '../../../core/erros/erro-dominio';
import { LancamentosMony } from '../lancamentos.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  tipo: z
    .enum(TIPOS_PARCELAMENTO)
    .describe('compra_cartao (compra parcelada no crédito) ou divida (empréstimo, financiamento).'),
  nome: z.string().trim().min(1).max(100).describe('O que foi comprado ou a dívida.'),
  valorCentavos: campos.valorCentavos.describe(
    'Total em centavos (com juros, o valor financiado).',
  ),
  totalParcelas: z.number().int().min(2).max(MAXIMO_PARCELAS),
  taxaJurosMensal: z
    .number()
    .min(0)
    .max(TAXA_MAXIMA_PERCENTUAL)
    .optional()
    .describe('Juros ao mês, em %, só se a pessoa disser.'),
  dataInicio: campos.data
    .optional()
    .describe('Compra no cartão: a data da compra. Dívida: a da primeira parcela. Sem ela, hoje.'),
  categoriaId: campos.id('listar_categorias').describe('Categoria de despesa.'),
  cartaoId: campos.id('listar_cartoes').optional().describe('Obrigatório na compra no cartão.'),
  formaPagamento: z
    .enum(FORMAS_PAGAMENTO_FATURA)
    .optional()
    .describe('Dívida: como as parcelas são pagas; sem ela, boleto.'),
});

/** `criar_parcelamento` (doc 08): gera as parcelas pelo `ParcelamentosService` e mostra o resumo. */
@Injectable()
export class CriarParcelamentoTool implements Ferramenta<typeof esquema> {
  readonly nome = 'criar_parcelamento';
  readonly descricao =
    'Registra uma compra parcelada no cartão ou uma dívida em parcelas (gera as parcelas). Para uma compra simples no crédito em N vezes, criar_transacao com parcelas também serve.';
  readonly esquema = esquema;

  constructor(private readonly lancamentos: LancamentosMony) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const dados = esquemaNovoParcelamento.safeParse(entrada);
    if (!dados.success) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: dados.error.issues.map(({ message }) => message).join('; '),
      });
    }
    const { lancamento, resumo } = await this.lancamentos.registrarParcelamento(
      contexto,
      dados.data,
    );
    return { dados: { gravado: true, lancamento }, componentes: [resumo] };
  }
}
