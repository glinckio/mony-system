import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { ErroDominio } from '../../../core/erros/erro-dominio';
import { MetasService } from '../../metas/metas.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  metaId: campos.id('consultar_metas'),
  aporteCentavos: campos.valorCentavos
    .optional()
    .describe('Quanto a pessoa guardou agora na meta (aporte de hoje), em centavos.'),
  titulo: z.string().trim().min(1).max(100).optional(),
  valorAlvoCentavos: campos.valorCentavos.optional().describe('Novo alvo, em centavos.'),
  prazo: campos.data.nullable().optional().describe('Novo prazo, AAAA-MM-DD; null tira o prazo.'),
  concluida: z.boolean().optional().describe('Marcar como concluída (ou reabrir).'),
});

/**
 * `atualizar_meta` (doc 08): aporte (RN-063, com a sugestão de concluir ao chegar no alvo) e mudanças
 * de título, alvo, prazo e conclusão, pelo `MetasService`.
 */
@Injectable()
export class AtualizarMetaTool implements Ferramenta<typeof esquema> {
  readonly nome = 'atualizar_meta';
  readonly descricao =
    'Registra quanto a pessoa guardou numa meta (aporteCentavos) e/ou muda título, alvo, prazo ou conclusão. Se a resposta trouxer sugerirConclusao, pergunte se ela quer marcar a meta como concluída.';
  readonly esquema = esquema;

  constructor(private readonly metas: MetasService) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const { metaId, aporteCentavos, ...mudancas } = entrada;
    if (aporteCentavos === undefined && Object.keys(mudancas).length === 0) {
      throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'Nada para mudar na meta.' });
    }
    let sugerirConclusao = false;
    if (aporteCentavos !== undefined) {
      ({ sugerirConclusao } = await this.metas.aportar(contexto, metaId, {
        valorCentavos: aporteCentavos,
      }));
    }
    const meta =
      Object.keys(mudancas).length > 0
        ? await this.metas.atualizar(contexto, metaId, mudancas)
        : await this.metas.buscar(contexto, metaId);
    return {
      dados: {
        atualizada: true,
        meta: {
          id: meta.id,
          titulo: meta.titulo,
          valorAlvoCentavos: meta.valorAlvoCentavos,
          valorAtualCentavos: meta.valorAtualCentavos,
          restanteCentavos: meta.restanteCentavos,
          percentual: meta.percentual,
          prazo: meta.prazo,
          concluida: meta.concluida,
        },
        sugerirConclusao,
      },
    };
  }
}
