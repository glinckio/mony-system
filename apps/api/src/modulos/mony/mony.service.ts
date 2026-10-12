import { Injectable } from '@nestjs/common';
import type {
  AcaoMony,
  ConsultaConversa,
  PaginaConversa,
  RespostaAcaoMony,
} from '@mony/shared/mony';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { DocumentosMony } from './documentos.service';
import { paraMensagemConversa } from './historico';
import { LancamentosMony } from './lancamentos.service';
import { MonyRepository, type PosicaoMensagem } from './mony.repository';
import { RoteadorRegras } from './roteador-regras.service';

/** Histórico da conversa e toques em botão da Mony (doc 08). O chat em SSE é do orquestrador. */
@Injectable()
export class MonyService {
  constructor(
    private readonly repositorio: MonyRepository,
    private readonly regras: RoteadorRegras,
    private readonly lancamentos: LancamentosMony,
    private readonly documentos: DocumentosMony,
  ) {}

  /** `GET /mony/conversa`: da mais nova para a mais antiga, por cursor, com busca no texto. */
  async conversa(contexto: Contexto, consulta: ConsultaConversa): Promise<PaginaConversa> {
    const usuarioId = usuarioDoContexto(contexto);
    const linhas = await this.repositorio.historico(
      usuarioId,
      consulta.texto,
      consulta.cursor === undefined ? null : lerCursor(consulta.cursor),
      consulta.limite + 1,
    );
    const pagina = linhas.slice(0, consulta.limite);
    const ultima = pagina.at(-1);
    return {
      itens: pagina.map(paraMensagemConversa),
      proximoCursor: linhas.length > consulta.limite && ultima ? escreverCursor(ultima) : null,
    };
  }

  /**
   * Toque num botão (RN-084): responde por regra, sem o modelo (pergunta do rascunho, [Desfazer],
   * confirmação de exclusão, confirmação do que foi lido de foto ou PDF), e o toque e a resposta entram no histórico. O mesmo toque repetido
   * não chega aqui: a idempotência devolve a resposta guardada.
   */
  async agir(contexto: Contexto, acao: AcaoMony): Promise<RespostaAcaoMony> {
    const usuarioId = usuarioDoContexto(contexto);
    const conversaId = await this.repositorio.conversaAtual(usuarioId);
    const { resposta, toque } = await this.executar(contexto, conversaId, acao);
    const chave = contexto.idempotencyKey;
    await this.repositorio.salvarMensagem({
      usuarioId,
      conversaId,
      autor: 'usuario',
      tipo: 'botao',
      conteudo: toque,
      componentes: [],
      idempotencyKey: chave,
    });
    await this.repositorio.salvarMensagem({
      usuarioId,
      conversaId,
      autor: 'mony',
      tipo: 'texto',
      conteudo: resposta.texto,
      componentes: resposta.componente ? [resposta.componente] : [],
      idempotencyKey: chave === undefined ? undefined : `${chave}:resposta`,
    });
    return resposta;
  }

  private async executar(
    contexto: Contexto,
    conversaId: string,
    acao: AcaoMony,
  ): Promise<{ resposta: RespostaAcaoMony; toque: string }> {
    switch (acao.tipo) {
      case 'rascunho':
        return this.regras.agir(contexto, conversaId, acao);
      case 'desfazer':
        return {
          toque: 'Desfazer',
          resposta: await this.lancamentos.desfazer(contexto, acao.alvo, acao.id),
        };
      case 'excluir_transacao':
        return {
          toque: 'Excluir',
          resposta: await this.lancamentos.excluir(contexto, acao.transacaoId),
        };
      case 'pagar_fatura':
        return {
          toque: 'Pagar',
          resposta: await this.lancamentos.pagarFatura(contexto, acao.faturaId, acao.valorCentavos),
        };
      case 'confirmar_importacao':
      case 'descartar_importacao':
        return this.documentos.agir(contexto, conversaId, acao);
      case 'cancelar':
        return {
          toque: 'Cancelar',
          resposta: { texto: 'Tudo bem, não mexi em nada.', componente: null, transacaoId: null },
        };
    }
  }
}

/** Cursor opaco: criação e id da última mensagem da página. */
function escreverCursor(mensagem: PosicaoMensagem): string {
  return Buffer.from(
    JSON.stringify({ c: mensagem.criadoEm.toISOString(), i: mensagem.id }),
  ).toString('base64url');
}

function lerCursor(cursor: string): PosicaoMensagem {
  try {
    const { c, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      c?: unknown;
      i?: unknown;
    };
    if (
      typeof c === 'string' &&
      !Number.isNaN(Date.parse(c)) &&
      typeof i === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(i)
    ) {
      return { criadoEm: new Date(c), id: i };
    }
  } catch {
    // cai no erro abaixo
  }
  throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'Cursor inválido.' });
}
