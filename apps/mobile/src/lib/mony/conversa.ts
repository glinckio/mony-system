import { ErroApi, renovarSessaoUmaVez } from '@mony/api-client';
import { ehRespostaErro } from '@mony/shared/erros';
import { type EventoMony, eventoMonyDoSse, LeitorSse } from '@mony/shared/mony';
import { randomUUID } from 'expo-crypto';
import { fetch } from 'expo/fetch';

import { cabecalhosDoApp } from '@/lib/auth/aparelho';
import { configApp } from '@/lib/config';
import { aoErroDaApi } from '@/lib/versao';
import { useSessao } from '@/stores/sessao';

/** Abre o SSE com o token da sessão e os cabeçalhos do app, como o cliente gerado. */
async function abrirConversa(texto: string, sinal?: AbortSignal) {
  const token = useSessao.getState().tokenAcesso;
  const resposta = await fetch(`${configApp.urlApi}/v1/mony/mensagens`, {
    method: 'POST',
    headers: {
      ...cabecalhosDoApp(),
      accept: 'text/event-stream',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ texto }),
    ...(sinal ? { signal: sinal } : {}),
  });
  return { resposta, comToken: Boolean(token) };
}

/**
 * Envia a mensagem à Mony e chama `aoEvento` a cada evento do SSE, assim que ele chega (doc 04).
 * O `fetch` do `expo/fetch` lê o corpo em streaming; o `fetch` global do React Native só entrega o
 * corpo inteiro no fim. Token vencido: espera a renovação única do cliente gerado e tenta de novo,
 * uma vez. Erro antes do streaming (sessão, validação) vira `ErroApi`, como no cliente gerado.
 */
export async function enviarMensagemMony(
  texto: string,
  aoEvento: (evento: EventoMony) => void,
  sinal?: AbortSignal,
): Promise<void> {
  const primeira = await abrirConversa(texto, sinal);
  let resposta = primeira.resposta;
  if (resposta.status === 401 && primeira.comToken && (await renovarSessaoUmaVez())) {
    resposta = (await abrirConversa(texto, sinal)).resposta;
  }
  if (!resposta.ok || !resposta.body) {
    const corpo: unknown = await resposta.json().catch(() => undefined);
    const erro = new ErroApi(resposta.status, ehRespostaErro(corpo) ? corpo : undefined);
    aoErroDaApi(erro);
    throw erro;
  }
  const leitor = new LeitorSse();
  const decodificador = new TextDecoder();
  const corpo = resposta.body.getReader();
  for (;;) {
    const { done, value } = await corpo.read();
    if (done) break;
    for (const bruto of leitor.ler(decodificador.decode(value, { stream: true }))) {
      const evento = eventoMonyDoSse(bruto);
      if (evento) aoEvento(evento);
    }
  }
}

/** Chave de idempotência do toque num botão (o mesmo toque repetido não grava duas vezes). */
export function chaveDoToque(): string {
  return randomUUID();
}
