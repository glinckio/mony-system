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
  sistema: ['Você é a Mony.'],
  mensagens: [{ papel: 'usuario' as const, conteudo: 'oi' }],
};

describe('LlmAnthropic', () => {
  it('manda o pedido em streaming e devolve os pedaços de texto e o consumo', async () => {
    const buscar = vi.fn<Buscar>(() =>
      Promise.resolve(
        respostaSse([
          {
            type: 'message_start',
            message: {
              usage: {
                input_tokens: 42,
                cache_creation_input_tokens: 100,
                cache_read_input_tokens: 8,
                output_tokens: 1,
              },
            },
          },
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
    // Entrada inclui o que foi gravado e lido do cache de prompt.
    expect(eventos.at(-1)).toEqual({
      tipo: 'fim',
      tokensEntrada: 150,
      tokensSaida: 9,
      parada: 'fim',
    });
    const [url, opcoes] = buscar.mock.calls[0] ?? [];
    expect(url).toBe(URL_MENSAGENS_ANTHROPIC);
    expect(opcoes?.headers).toMatchObject({
      'x-api-key': 'chave-teste',
      'anthropic-version': '2023-06-01',
    });
    expect(typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : null).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 1024,
      system: [{ type: 'text', text: 'Você é a Mony.', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: 'oi' }],
      stream: true,
    });
  });

  it('ferramentas: manda as definições, monta o pedido em pedaços e devolve os resultados', async () => {
    const buscar = vi.fn<Buscar>(() =>
      Promise.resolve(
        respostaSse([
          { type: 'message_start', message: { usage: { input_tokens: 300 } } },
          { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Vou ver.' },
          },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'listar_categorias',
              input: {},
            },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'input_json_delta', partial_json: '{"tip' },
          },
          {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'input_json_delta', partial_json: 'o": "despesa"}' },
          },
          { type: 'content_block_stop', index: 1 },
          {
            type: 'content_block_start',
            index: 2,
            content_block: { type: 'tool_use', id: 'toolu_2', name: 'resumo', input: {} },
          },
          { type: 'content_block_stop', index: 2 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use' },
            usage: { output_tokens: 31 },
          },
          { type: 'message_stop' },
        ]),
      ),
    );
    const eventos = await todos(
      new LlmAnthropic('k', 'claude-sonnet-5-5', buscar).conversar({
        sistema: ['Prompt.', 'Contexto.'],
        ferramentas: [
          {
            nome: 'listar_categorias',
            descricao: 'Lista as categorias.',
            esquemaEntrada: { type: 'object', properties: {} },
          },
        ],
        mensagens: [
          { papel: 'usuario', conteudo: 'quais categorias?' },
          {
            papel: 'assistente',
            conteudo: [
              { tipo: 'texto', texto: '' },
              { tipo: 'ferramenta', id: 'toolu_0', nome: 'listar_categorias', entrada: {} },
            ],
          },
          {
            papel: 'usuario',
            conteudo: [
              { tipo: 'resultado', id: 'toolu_0', conteudo: '{"erro":"x"}', erro: true },
              { tipo: 'resultado', id: 'toolu_9', conteudo: '[]', erro: false },
            ],
          },
        ],
      }),
    );

    expect(eventos).toEqual([
      { tipo: 'texto', texto: 'Vou ver.' },
      {
        tipo: 'ferramenta',
        id: 'toolu_1',
        nome: 'listar_categorias',
        entrada: { tipo: 'despesa' },
      },
      { tipo: 'ferramenta', id: 'toolu_2', nome: 'resumo', entrada: {} },
      { tipo: 'fim', tokensEntrada: 300, tokensSaida: 31, parada: 'ferramenta' },
    ]);
    const opcoes = buscar.mock.calls[0]?.[1];
    const corpo = (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : null) as Record<
      string,
      unknown
    >;
    // Um ponto de cache no prompt (igual para todos) e outro no contexto do usuário.
    expect(corpo.system).toEqual([
      { type: 'text', text: 'Prompt.', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Contexto.', cache_control: { type: 'ephemeral' } },
    ]);
    expect(corpo.tools).toEqual([
      {
        name: 'listar_categorias',
        description: 'Lista as categorias.',
        input_schema: { type: 'object', properties: {} },
      },
    ]);
    expect(corpo.messages).toEqual([
      { role: 'user', content: 'quais categorias?' },
      {
        role: 'assistant',
        // O bloco de texto vazio não vai: a API recusa.
        content: [{ type: 'tool_use', id: 'toolu_0', name: 'listar_categorias', input: {} }],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_0', content: '{"erro":"x"}', is_error: true },
          { type: 'tool_result', tool_use_id: 'toolu_9', content: '[]' },
        ],
      },
    ]);
  });

  it('T-065 imagem e PDF vão pela URL, e a ferramenta obrigatória vira tool_choice', async () => {
    const buscar = vi.fn<Buscar>(() =>
      Promise.resolve(
        respostaSse([
          { type: 'message_start', message: { usage: { input_tokens: 1500 } } },
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: 'toolu_1', name: 'ler_documento', input: {} },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{"documento":"cupom"}' },
          },
          { type: 'content_block_stop', index: 0 },
          {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use' },
            usage: { output_tokens: 9 },
          },
          { type: 'message_stop' },
        ]),
      ),
    );
    const eventos = await todos(
      new LlmAnthropic('k', 'claude-sonnet-5-5', buscar).conversar({
        sistema: ['Leia.'],
        ferramentas: [
          { nome: 'ler_documento', descricao: 'Leitura.', esquemaEntrada: { type: 'object' } },
        ],
        ferramentaObrigatoria: 'ler_documento',
        mensagens: [
          {
            papel: 'usuario',
            conteudo: [
              { tipo: 'imagem', url: 'https://s3.teste/foto.jpg?assinada' },
              { tipo: 'documento', url: 'https://s3.teste/fatura.pdf?assinada' },
              { tipo: 'texto', texto: 'Leia este documento.' },
            ],
          },
        ],
      }),
    );

    expect(eventos[0]).toMatchObject({
      tipo: 'ferramenta',
      nome: 'ler_documento',
      entrada: { documento: 'cupom' },
    });
    const corpo = JSON.parse(buscar.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
    expect(corpo.tool_choice).toEqual({ type: 'tool', name: 'ler_documento' });
    expect(corpo.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: 'https://s3.teste/foto.jpg?assinada' } },
          {
            type: 'document',
            source: { type: 'url', url: 'https://s3.teste/fatura.pdf?assinada' },
          },
          { type: 'text', text: 'Leia este documento.' },
        ],
      },
    ]);
  });

  it('limite de tokens vira parada "limite"; corpo cortado no meio é transitório', async () => {
    const limite = await todos(
      new LlmAnthropic(
        'k',
        'm',
        vi.fn<Buscar>(() =>
          Promise.resolve(
            respostaSse([
              { type: 'message_delta', delta: { stop_reason: 'max_tokens' }, usage: {} },
            ]),
          ),
        ),
      ).conversar(pedido),
    );
    expect(limite.at(-1)).toMatchObject({ tipo: 'fim', parada: 'limite' });

    const cortado = new ReadableStream<Uint8Array>({
      start(controle) {
        controle.enqueue(new TextEncoder().encode('event: ping\ndata: {"type":"ping"}\n\n'));
        controle.error(new Error('socket hang up'));
      },
    });
    const erro = await todos(
      new LlmAnthropic(
        'k',
        'm',
        vi.fn<Buscar>(() => Promise.resolve(new Response(cortado, { status: 200 }))),
      ).conversar(pedido),
    ).catch((falha: unknown) => falha);
    expect(erro).toBeInstanceOf(ErroLlm);
    expect((erro as ErroLlm).transitorio).toBe(true);
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
  it('segue o roteiro (texto, ferramentas, falha) e depois volta ao texto fixo', async () => {
    const fake = new LlmFake();
    const falha = new ErroLlm('fora do ar', true);
    fake.roteirizar(
      { ferramentas: [{ nome: 'listar_categorias', entrada: { tipo: 'despesa' } }] },
      { erro: falha },
      { texto: 'Você tem 3 categorias.' },
    );

    const primeira = await todos(fake.conversar(pedido));
    expect(primeira[0]).toMatchObject({
      tipo: 'ferramenta',
      nome: 'listar_categorias',
      entrada: { tipo: 'despesa' },
    });
    expect(primeira.at(-1)).toMatchObject({ tipo: 'fim', parada: 'ferramenta' });
    await expect(todos(fake.conversar(pedido))).rejects.toBe(falha);
    const terceira = await todos(fake.conversar(pedido));
    expect(terceira.flatMap((evento) => (evento.tipo === 'texto' ? [evento.texto] : []))).toEqual([
      'Você tem 3 c',
      'ategorias.',
    ]);
    expect(terceira.at(-1)).toMatchObject({ tipo: 'fim', parada: 'fim' });
    expect(fake.pedidos).toHaveLength(3);
    expect(fake.modelo).toBe('fake');

    const fixa = await todos(fake.conversar(pedido));
    expect(fixa.flatMap((evento) => (evento.tipo === 'texto' ? [evento.texto] : [])).join('')).toBe(
      RESPOSTA_FAKE,
    );
    fake.limpar();
    expect(fake.pedidos).toEqual([]);
  });

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

  it('anthropic exige a chave; o padrão é o fake; o modelo padrão é o Haiku 5.5', () => {
    expect(validarAmbiente(banco).IA_PROVEDOR).toBe('fake');
    expect(() => validarAmbiente({ ...banco, IA_PROVEDOR: 'anthropic' })).toThrow(
      /ANTHROPIC_CHAVE_API/,
    );
    expect(
      validarAmbiente({ ...banco, IA_PROVEDOR: 'anthropic', ANTHROPIC_CHAVE_API: 'k' }).IA_MODELO,
    ).toBe('claude-haiku-5-5');
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
