import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { CartoesService } from '../../cartoes/cartoes.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({ cartaoId: campos.id('listar_cartoes') });

/** Faturas pagas que ainda entram na resposta, para "paguei a última?". */
const PAGAS_NA_RESPOSTA = 1;

/**
 * `consultar_cartao` (doc 08): limite usado e disponível (RN-034), a fatura atual e as que ainda têm
 * saldo ou são futuras (RN-031 a RN-033).
 */
@Injectable()
export class ConsultarCartaoTool implements Ferramenta<typeof esquema> {
  readonly nome = 'consultar_cartao';
  readonly descricao =
    'Situação de um cartão: limite total, usado e disponível, percentual usado, a fatura atual e as faturas em aberto ou futuras (id, vencimento, total, pago, saldo e status), em centavos. Use antes de pagar_fatura.';
  readonly esquema = esquema;

  constructor(private readonly cartoes: CartoesService) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const [cartao, { itens }] = await Promise.all([
      this.cartoes.buscar(contexto, entrada.cartaoId),
      this.cartoes.faturas(contexto, entrada.cartaoId),
    ]);
    const pagas = itens
      .filter(({ saldoCentavos }) => saldoCentavos <= 0)
      .slice(0, PAGAS_NA_RESPOSTA);
    const faturas = itens
      .filter(({ saldoCentavos, status }) => saldoCentavos > 0 || status === 'aberta')
      .concat(pagas)
      .map((fatura) => ({
        id: fatura.id,
        competencia: fatura.competencia.slice(0, 7),
        dataFechamento: fatura.dataFechamento,
        dataVencimento: fatura.dataVencimento,
        valorTotalCentavos: fatura.valorTotalCentavos,
        valorPagoCentavos: fatura.valorPagoCentavos,
        saldoCentavos: fatura.saldoCentavos,
        status: fatura.status,
      }));
    return {
      dados: {
        cartao: {
          id: cartao.id,
          nome: cartao.nome,
          limiteTotalCentavos: cartao.limiteTotalCentavos,
          limiteUsadoCentavos: cartao.limiteUsadoCentavos,
          limiteDisponivelCentavos: cartao.limiteDisponivelCentavos,
          percentualUsado: cartao.percentualUsado,
          faturaAtual: {
            id: cartao.faturaAtual.id,
            dataVencimento: cartao.faturaAtual.dataVencimento,
            valorTotalCentavos: cartao.faturaAtual.valorTotalCentavos,
            saldoCentavos: cartao.faturaAtual.saldoCentavos,
            status: cartao.faturaAtual.status,
          },
        },
        faturas,
      },
    };
  }
}
