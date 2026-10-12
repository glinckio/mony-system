import type { ComponenteMony, MensagemConversa, OpcaoBotao } from '@mony/shared/mony';

/** O arquivo da mensagem da pessoa: voz (T-064), foto ou PDF (T-065). */
export type TipoArquivo = 'audio' | 'foto' | 'pdf';

/** Uma mensagem na tela: do histórico (id da API) ou desta conversa (id local). */
export interface Mensagem {
  id: string;
  autor: 'usuario' | 'mony';
  texto: string;
  /** Botões de pergunta ou confirmação e cartões de resumo (RN-082), na ordem em que chegaram. */
  componentes: ComponenteMony[];
  erro: boolean;
  /**
   * Voz, com o texto que a Mony entendeu, ou foto e PDF, que a Mony lê e devolve como lançamentos
   * a confirmar.
   */
  arquivo: TipoArquivo | null;
}

/** O botão tocado: a mensagem e o componente dela. */
export interface Toque {
  mensagemId: string;
  indice: number;
  opcao: OpcaoBotao;
}

const ARQUIVO_DO_TIPO: Partial<Record<MensagemConversa['tipo'], TipoArquivo>> = {
  audio: 'audio',
  imagem: 'foto',
  pdf: 'pdf',
};

/** A mensagem do histórico (`GET /mony/conversa`) como a tela mostra; o toque num botão é o rótulo. */
export function daConversa(mensagem: MensagemConversa): Mensagem {
  return {
    id: mensagem.id,
    autor: mensagem.autor,
    texto: mensagem.conteudo ?? '',
    componentes: mensagem.componentes,
    erro: false,
    arquivo: ARQUIVO_DO_TIPO[mensagem.tipo] ?? null,
  };
}

/**
 * Tira da mensagem o componente tocado (a pergunta respondida, o resumo desfeito, o lançamento lido
 * confirmado). [Confirmar todos] e [Descartar todos] tiram os cartões da mesma leitura; sem
 * cartão, o [Confirmar todos] sai também.
 */
export function semOTocado(componentes: readonly ComponenteMony[], toque: Toque): ComponenteMony[] {
  const importacao = (componente: ComponenteMony) =>
    componente.opcoes.find(({ acao }) => typeof acao.importacaoId === 'string')?.acao.importacaoId;
  const daLeitura = toque.opcao.acao.importacaoId;
  const todos = typeof daLeitura === 'string' && toque.opcao.acao.indice === null;
  const restantes = componentes.filter(
    (componente, indice) =>
      indice !== toque.indice && !(todos && importacao(componente) === daLeitura),
  );
  if (typeof daLeitura !== 'string') return restantes;
  const cartoes = restantes.some(
    (componente) => componente.tipo === 'resumo' && importacao(componente) === daLeitura,
  );
  return cartoes
    ? restantes
    : restantes.filter((componente) => importacao(componente) !== daLeitura);
}
