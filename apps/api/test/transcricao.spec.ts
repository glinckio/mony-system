import { describe, expect, it, vi } from 'vitest';

import { validarAmbiente } from '../src/core/config/ambiente';
import type { Configuracao } from '../src/core/config/configuracao';
import { criarProvedorTranscricao } from '../src/integracoes/ia/ia.module';
import type { Buscar } from '../src/integracoes/ia/llm-anthropic';
import { TranscricaoDeepgram, URL_DEEPGRAM } from '../src/integracoes/ia/transcricao-deepgram';
import { TRANSCRICAO_FAKE, TranscricaoFake } from '../src/integracoes/ia/transcricao-fake';
import { ErroTranscricao } from '../src/integracoes/ia/transcricao.provider';

const pedido = { url: 'https://arquivos.teste/u/audio.m4a?assinado', tipoConteudo: 'audio/mp4' };

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

describe('TranscricaoDeepgram', () => {
  it('manda a URL do áudio em pt-BR com pontuação e devolve o texto e a duração', async () => {
    const buscar = vi.fn<Buscar>(() =>
      Promise.resolve(
        json({
          metadata: { duration: 4.2 },
          results: {
            channels: [{ alternatives: [{ transcript: ' Gastei 45 reais no mercado. ' }] }],
          },
        }),
      ),
    );
    const controle = new AbortController();

    const transcricao = await new TranscricaoDeepgram('chave-teste', 'nova-3', buscar).transcrever({
      ...pedido,
      sinal: controle.signal,
    });

    expect(transcricao).toEqual({ texto: 'Gastei 45 reais no mercado.', duracaoSegundos: 4.2 });
    const [url, opcoes] = buscar.mock.calls[0] ?? [];
    const endereco = new URL(String(url));
    expect(`${endereco.origin}${endereco.pathname}`).toBe(URL_DEEPGRAM);
    expect(Object.fromEntries(endereco.searchParams)).toEqual({
      model: 'nova-3',
      language: 'pt-BR',
      smart_format: 'true',
      punctuate: 'true',
    });
    expect(opcoes).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Token chave-teste', 'content-type': 'application/json' },
      signal: controle.signal,
    });
    expect(JSON.parse(opcoes?.body as string)).toEqual({ url: pedido.url });
  });

  it('sem fala, o texto vem vazio', async () => {
    const buscar = vi.fn<Buscar>(() =>
      Promise.resolve(json({ results: { channels: [{ alternatives: [{ transcript: '' }] }] } })),
    );
    expect(await new TranscricaoDeepgram('k', 'nova-3', buscar).transcrever(pedido)).toEqual({
      texto: '',
      duracaoSegundos: null,
    });
  });

  it('429, 5xx e falha de rede são transitórios; 4xx não', async () => {
    const com = async (resposta: () => Promise<Response>): Promise<ErroTranscricao> => {
      try {
        await new TranscricaoDeepgram('k', 'm', vi.fn<Buscar>(resposta)).transcrever(pedido);
      } catch (erro) {
        if (erro instanceof ErroTranscricao) return erro;
        throw erro;
      }
      throw new Error('esperava ErroTranscricao');
    };

    expect((await com(() => Promise.reject(new Error('ECONNRESET')))).transitorio).toBe(true);
    expect((await com(() => Promise.resolve(json({}, 429)))).transitorio).toBe(true);
    expect((await com(() => Promise.resolve(json({}, 503)))).transitorio).toBe(true);
    const invalido = await com(() => Promise.resolve(json({ err_msg: 'formato' }, 400)));
    expect(invalido.transitorio).toBe(false);
    expect(invalido.message).toContain('400');
  });
});

describe('TranscricaoFake', () => {
  it('segue o roteiro (texto ou falha) e depois devolve o texto fixo', async () => {
    const fake = new TranscricaoFake();
    const falha = new ErroTranscricao('fora do ar', true);
    fake.roteirizar({ texto: 'paguei a luz', duracaoSegundos: 2 }, { erro: falha });

    expect(await fake.transcrever(pedido)).toEqual({ texto: 'paguei a luz', duracaoSegundos: 2 });
    await expect(fake.transcrever(pedido)).rejects.toBe(falha);
    expect((await fake.transcrever(pedido)).texto).toBe(TRANSCRICAO_FAKE);
    expect(fake.pedidos).toHaveLength(3);
    expect(fake.modelo).toBe('fake');
    fake.limpar();
    expect(fake.pedidos).toEqual([]);
  });
});

describe('TRANSCRICAO_PROVEDOR', () => {
  const banco = {
    DATABASE_URL: 'postgresql://mony:mony@localhost:5432/mony',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('deepgram exige a chave; o padrão é o fake', () => {
    expect(validarAmbiente(banco).TRANSCRICAO_PROVEDOR).toBe('fake');
    expect(() => validarAmbiente({ ...banco, TRANSCRICAO_PROVEDOR: 'deepgram' })).toThrow(
      /DEEPGRAM_CHAVE_API/,
    );
    expect(
      validarAmbiente({ ...banco, TRANSCRICAO_PROVEDOR: 'deepgram', DEEPGRAM_CHAVE_API: 'k' })
        .TRANSCRICAO_MODELO,
    ).toBe('nova-3');
  });

  it('escolhe o provedor pela configuração', () => {
    const config = (provedorTranscricao: 'fake' | 'deepgram') =>
      ({
        provedorTranscricao,
        chaveDeepgram: 'k',
        modeloTranscricao: 'nova-3',
        ehProducao: false,
      }) as unknown as Configuracao;
    expect(criarProvedorTranscricao(config('deepgram'))).toBeInstanceOf(TranscricaoDeepgram);
    expect(criarProvedorTranscricao(config('fake'))).toBeInstanceOf(TranscricaoFake);
  });
});
