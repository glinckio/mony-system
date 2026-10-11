import { ErroApi } from '@mony/api-client';
import { ehRespostaErro } from '@mony/shared/erros';
import { type EventoMony, eventoMonyDoSse, LeitorSse } from '@mony/shared/mony';
import { fetch } from 'expo/fetch';

import { configApp } from '@/lib/config';
import { useSessao } from '@/stores/sessao';

/**
 * Envia a mensagem à Mony e chama `aoEvento` a cada evento do SSE, assim que ele chega (doc 04).
 * O `fetch` do `expo/fetch` lê o corpo em streaming; o `fetch` global do React Native só entrega o
 * corpo inteiro no fim. Erro antes do streaming (sessão, validação) vira `ErroApi`, como no cliente
 * gerado.
 */
export async function enviarMensagemMony(
  texto: string,
  aoEvento: (evento: EventoMony) => void,
  sinal?: AbortSignal,
): Promise<void> {
  const token = useSessao.getState().tokenAcesso;
  const resposta = await fetch(`${configApp.urlApi}/v1/mony/mensagens`, {
    method: 'POST',
    headers: {
      accept: 'text/event-stream',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ texto }),
    ...(sinal ? { signal: sinal } : {}),
  });
  if (!resposta.ok || !resposta.body) {
    const corpo: unknown = await resposta.json().catch(() => undefined);
    throw new ErroApi(resposta.status, ehRespostaErro(corpo) ? corpo : undefined);
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
  return `mony-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
