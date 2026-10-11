import { describe, expect, it, vi } from 'vitest';

import { validarAmbiente } from '../src/core/config/ambiente';
import type { Configuracao } from '../src/core/config/configuracao';
import { criarProvedorLlm } from '../src/integracoes/ia/ia.module';
import {
  type Buscar,
  LlmAnthropic,
  URL_MENSAGENS_ANTHROPIC,
} from '../src/integracoes/ia/llm-anthropic';
import { LlmFake, RESPOSTA_FAKE } from '../src/integracoes/ia/llm-fake';
import { ErroLlm, type EventoLlm } from '../src/integracoes/ia/llm.provider';

/** Corpo SSE como a Anthropic manda, cortado em pedaços pequenos. */
function respostaSse(eventos: object[], tamanho = 7): Response {
  const corpo = eventos
    .map(
      (evento) =>
        `event: ${(evento as { type: string }).type}\ndata: ${JSON.stringify(evento)}\n\n`,
    )
    .join('');
  const bytes = new TextEncoder().encode(corpo);
  const fluxo = new ReadableStream<Uint8Array>({
    start(controle) {
      for (let inicio = 0; inicio < bytes.length; inicio += tamanho) {
        controle.enqueue(bytes.slice(inicio, inicio + tamanho));
      }
      controle.close();
    },
  });
  return new Response(fluxo, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

async function todos(fluxo: AsyncIterable<EventoLlm>): Promise<EventoLlm[]> {
  const eventos: EventoLlm[] = [];
  for await (const evento of fluxo) eventos.push(evento);
  return eventos;
}

const pedido = {
  sistema: 'Você é a Mony.',
  mensagens: [{ papel: 'usuario' as const, texto: 'oi' }],
};

describe('LlmAnthropic', () => {
  it('manda o pedido em streaming e devolve os pedaços de texto e o consumo', async () => {
    const buscar = vi.fn<Buscar>(() =>
      Promise.resolve(
        respostaSse([
          { type: 'message_start', message: { usage: { input_tokens: 42, output_tokens: 1 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          { type: 'ping' },
          { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Olá, ' } },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'tudo bem? Ç' },
          },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn' },
            usage: { output_tokens: 9 },
          },
          { type: 'message_stop' },
        ]),
      ),
    );
    const eventos = await todos(
      new LlmAnthropic('chave-teste', 'claude-sonnet-5-5', buscar).conversar(pedido),
    );

    expect(
      eventos
        .filter((evento) => evento.tipo === 'texto')
        .map((evento) => evento.texto)
        .join(''),
    ).toBe('Olá, tudo bem? Ç');
    expect(eventos.at(-1)).toEqual({ tipo: 'fim', tokensEntrada: 42, tokensSaida: 9 });
    const [url, opcoes] = buscar.mock.calls[0] ?? [];
    expect(url).toBe(URL_MENSAGENS_ANTHROPIC);
    expect(opcoes?.headers).toMatchObject({
      'x-api-key': 'chave-teste',
      'anthropic-version': '2023-06-01',
    });
    expect(typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : null).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 1024,
      system: 'Você é a Mony.',
      messages: [{ role: 'user', content: 'oi' }],
      stream: true,
    });
  });

  it('429, 5xx, sobrecarga e falha de rede são transitórios; 4xx não', async () => {
    const com = async (resposta: () => Promise<Response>): Promise<ErroLlm> => {
      try {
        await todos(new LlmAnthropic('k', 'm', vi.fn<Buscar>(resposta)).conversar(pedido));
      } catch (erro) {
        if (erro instanceof ErroLlm) return erro;
        throw erro;
      }
      throw new Error('esperava ErroLlm');
    };

    expect((await com(() => Promise.reject(new Error('ECONNRESET')))).transitorio).toBe(true);
    const sobrecarga = await com(() =>
      Promise.resolve(
        respostaSse([{ type: 'error', error: { type: 'overloaded_error', message: 'cheio' } }]),
      ),
    );
    expect(sobrecarga).toBeInstanceOf(ErroLlm);
    expect(sobrecarga.transitorio).toBe(true);
  });
});

describe('LlmFake', () => {
  it('responde o texto fixo em pedaços e para quando o pedido é cancelado', async () => {
    const eventos = await todos(new LlmFake().conversar(pedido));
    expect(eventos.filter((evento) => evento.tipo === 'texto').length).toBeGreaterThan(1);
    expect(
      eventos.flatMap((evento) => (evento.tipo === 'texto' ? [evento.texto] : [])).join(''),
    ).toBe(RESPOSTA_FAKE);

    const controle = new AbortController();
    controle.abort();
    expect(await todos(new LlmFake().conversar({ ...pedido, sinal: controle.signal }))).toEqual([]);
  });
});

describe('IA_PROVEDOR', () => {
  const banco = {
    DATABASE_URL: 'postgresql://mony:mony@localhost:5432/mony',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('anthropic exige a chave; o padrão é o fake', () => {
    expect(validarAmbiente(banco).IA_PROVEDOR).toBe('fake');
    expect(() => validarAmbiente({ ...banco, IA_PROVEDOR: 'anthropic' })).toThrow(
      /ANTHROPIC_CHAVE_API/,
    );
    expect(
      validarAmbiente({ ...banco, IA_PROVEDOR: 'anthropic', ANTHROPIC_CHAVE_API: 'k' }).IA_MODELO,
    ).toBe('claude-sonnet-5-5');
  });

  it('escolhe o provedor pela configuração', () => {
    const config = (provedorIa: 'fake' | 'anthropic') =>
      ({
        provedorIa,
        chaveAnthropic: 'k',
        modeloIa: 'm',
        ambiente: 'test',
        ehProducao: false,
      }) as unknown as Configuracao;
    expect(criarProvedorLlm(config('anthropic'))).toBeInstanceOf(LlmAnthropic);
    expect(criarProvedorLlm(config('fake'))).toBeInstanceOf(LlmFake);
  });
});
