import { Injectable } from '@nestjs/common';
import { FORMAS_PAGAMENTO, STATUS_TRANSACAO } from '@mony/shared/enums';
import { z } from 'zod';

import { TransacoesService } from '../../transacoes/transacoes.service';
import { LancamentosMony } from '../lancamentos.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  transacaoId: campos.id('consultar_transacoes ou de um lançamento desta conversa'),
  descricao: z.string().trim().min(1).max(200).optional(),
  valorCentavos: campos.valorCentavos.optional(),
  data: campos.data.optional(),
  categoriaId: campos.id('listar_categorias').optional(),
  formaPagamento: z.enum(FORMAS_PAGAMENTO).optional(),
  cartaoId: campos.id('listar_cartoes').optional(),
  status: z.enum(STATUS_TRANSACAO).optional().describe('pago ou pendente.'),
});

/** `editar_transacao` (doc 08): muda só o que veio, pelo `TransacoesService`. */
@Injectable()
export class EditarTransacaoTool implements Ferramenta<typeof esquema> {
  readonly nome = 'editar_transacao';
  readonly descricao =
    'Corrige um lançamento: mande só os campos que mudam. Ache o id com consultar_transacoes; nunca adivinhe.';
  readonly esquema = esquema;

  constructor(
    private readonly transacoes: TransacoesService,
    private readonly lancamentos: LancamentosMony,
  ) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const { transacaoId, ...mudancas } = entrada;
    const { transacao } = await this.transacoes.atualizar(contexto, transacaoId, mudancas);
    const { lancamento, resumo } = await this.lancamentos.resumoDaTransacao(contexto, transacao, {
      comDesfazer: false,
    });
    return { dados: { alterado: true, lancamento }, componentes: [resumo] };
  }
}
