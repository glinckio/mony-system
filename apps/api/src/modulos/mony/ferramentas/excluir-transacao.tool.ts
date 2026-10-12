import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { LancamentosMony } from '../lancamentos.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  transacaoId: campos.id('consultar_transacoes ou de um lançamento desta conversa'),
});

/** `excluir_transacao` (doc 08): só pede a confirmação; exclui quando a pessoa toca (RN-092). */
@Injectable()
export class ExcluirTransacaoTool implements Ferramenta<typeof esquema> {
  readonly nome = 'excluir_transacao';
  readonly descricao =
    'Pede a confirmação para excluir um lançamento: mostra os botões [Excluir] e [Cancelar]. Não exclui nada sozinha; nunca diga que excluiu.';
  readonly esquema = esquema;

  constructor(private readonly lancamentos: LancamentosMony) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const confirmacao = await this.lancamentos.pedirExclusao(contexto, entrada.transacaoId);
    return {
      dados: {
        excluido: false,
        orientacao:
          'Peça a confirmação em uma frase; os botões aparecem abaixo da sua resposta. Só sai se a pessoa tocar em Excluir.',
      },
      componentes: [confirmacao],
    };
  }
}
