import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { LancamentosMony } from '../lancamentos.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  faturaId: campos.id('consultar_cartao'),
  valorCentavos: campos.valorCentavos
    .optional()
    .describe('Pagamento parcial, em centavos. Sem ele, o que falta pagar.'),
});

/** `pagar_fatura` (doc 08): só pede a confirmação; paga quando a pessoa toca (RN-092). */
@Injectable()
export class PagarFaturaTool implements Ferramenta<typeof esquema> {
  readonly nome = 'pagar_fatura';
  readonly descricao =
    'Pede a confirmação para registrar o pagamento de uma fatura (total ou parcial): mostra os botões [Pagar] e [Cancelar]. Não paga nada sozinha; nunca diga que pagou.';
  readonly esquema = esquema;

  constructor(private readonly lancamentos: LancamentosMony) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const { componente, valorCentavos, cartao } = await this.lancamentos.pedirPagamento(
      contexto,
      entrada.faturaId,
      entrada.valorCentavos,
    );
    return {
      dados: {
        pago: false,
        cartao,
        valorCentavos,
        orientacao:
          'Peça a confirmação em uma frase; os botões aparecem abaixo da sua resposta. Só paga se a pessoa tocar em Pagar.',
      },
      componentes: [componente],
    };
  }
}
