import { Injectable } from '@nestjs/common';
import { normalizar } from '@mony/shared/rascunhos';

import { BASE_AJUDA, type TopicoAjuda, VERSAO_BASE_AJUDA } from './base-ajuda';

/** Palavras que não dizem o assunto. */
const VAZIAS = new Set([
  'como',
  'onde',
  'que',
  'qual',
  'quais',
  'para',
  'pra',
  'por',
  'com',
  'sem',
  'uma',
  'uns',
  'umas',
  'meu',
  'minha',
  'meus',
  'minhas',
  'eu',
  'faco',
  'fazer',
  'consigo',
  'posso',
  'tem',
  'tenho',
  'dar',
  'app',
  'aplicativo',
  'monitorizze',
  'nao',
  'mais',
]);

/** Tópicos devolvidos por busca. */
const MAXIMO = 3;

/** As palavras da pergunta, sem acento, sem as vazias e sem as muito curtas. */
export function palavrasDaPergunta(pergunta: string): string[] {
  return [
    ...new Set(
      normalizar(pergunta)
        .split(/[^a-z0-9]+/)
        .filter((palavra) => palavra.length >= 3 && !VAZIAS.has(palavra)),
    ),
  ];
}

/** A palavra bate com a do tópico: igual, ou uma começa com a outra ("parcelei" e "parcela"). */
function bate(palavra: string, doTopico: string): boolean {
  const raiz = (texto: string) => texto.slice(0, Math.max(4, Math.min(texto.length, 6)));
  return palavra === doTopico || raiz(palavra) === raiz(doTopico);
}

function pontos(topico: TopicoAjuda, palavras: readonly string[]): number {
  const titulo = palavrasDaPergunta(topico.titulo);
  return palavras.reduce((soma, palavra) => {
    if (topico.palavras.some((chave) => bate(palavra, chave))) return soma + 3;
    if (titulo.some((doTitulo) => bate(palavra, doTitulo))) return soma + 2;
    return soma;
  }, 0);
}

/** Um tópico achado, como vai para a Mony. */
export interface TopicoAchado {
  titulo: string;
  texto: string;
}

/**
 * Ajuda do app (doc 08, `ajuda_app`): procura na base versionada (`base-ajuda.ts`) os tópicos da
 * pergunta, pelas palavras-chave e pelo título, e devolve os 3 mais próximos. Sem nenhum, a Mony
 * diz que não sabe em vez de inventar.
 */
@Injectable()
export class AjudaService {
  buscar(pergunta: string): { versao: string; topicos: TopicoAchado[] } {
    const palavras = palavrasDaPergunta(pergunta);
    const topicos = BASE_AJUDA.map((topico) => ({ topico, pontos: pontos(topico, palavras) }))
      .filter(({ pontos: total }) => total > 0)
      .sort((a, b) => b.pontos - a.pontos)
      .slice(0, MAXIMO)
      .map(({ topico }) => ({ titulo: topico.titulo, texto: topico.texto }));
    return { versao: VERSAO_BASE_AJUDA, topicos };
  }
}
