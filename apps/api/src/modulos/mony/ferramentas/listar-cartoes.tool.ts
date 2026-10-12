import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { CartoesService } from '../../cartoes/cartoes.service';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({});

/** `listar_cartoes` (doc 08): os cartões, com limite, fechamento e vencimento. */
@Injectable()
export class ListarCartoesTool implements Ferramenta<typeof esquema> {
  readonly nome = 'listar_cartoes';
  readonly descricao =
    'Lista os cartões de crédito do usuário, com id, nome, final, dia de fechamento e de vencimento, limite disponível (centavos) e percentual do limite usado.';
  readonly esquema = esquema;

  constructor(private readonly cartoes: CartoesService) {}

  async executar(contexto: ContextoFerramenta): Promise<SaidaFerramenta> {
    const { itens } = await this.cartoes.listar(contexto);
    return {
      dados: {
        cartoes: itens.map((cartao) => ({
          id: cartao.id,
          nome: cartao.nome,
          final: cartao.final,
          diaFechamento: cartao.diaFechamento,
          diaVencimento: cartao.diaVencimento,
          limiteDisponivelCentavos: cartao.limiteDisponivelCentavos,
          percentualUsado: cartao.percentualUsado,
        })),
      },
    };
  }
}
