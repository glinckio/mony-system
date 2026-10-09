import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verificarSaude } from './gerado';
import { configurarCliente, ErroApi, requisicao } from './requisicao';

const fetchFalso = vi.fn<typeof fetch>();

function responder(status: number, corpo?: unknown): Response {
  return new Response(corpo === undefined ? null : JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchFalso);
  configurarCliente({ urlBase: 'https://api.teste' });
});

afterEach(() => {
  fetchFalso.mockReset();
  vi.unstubAllGlobals();
});

describe('requisicao', () => {
  it('usa a URL base, manda o token e devolve o JSON', async () => {
    configurarCliente({ urlBase: 'https://api.teste', obterToken: () => 'token-1' });
    fetchFalso.mockResolvedValue(responder(200, { status: 'ok' }));

    await expect(verificarSaude()).resolves.toEqual({ status: 'ok' });

    const [url, opcoes] = fetchFalso.mock.calls[0] ?? [];
    expect(url).toBe('https://api.teste/v1/health');
    expect(opcoes?.method).toBe('GET');
    expect(new Headers(opcoes?.headers).get('authorization')).toBe('Bearer token-1');
  });

  it('não manda authorization sem token e põe content-type quando há corpo', async () => {
    fetchFalso.mockResolvedValue(responder(201, { id: 'x' }));
    await requisicao('/v1/teste', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const cabecalhos = new Headers(fetchFalso.mock.calls[0]?.[1]?.headers);
    expect(cabecalhos.has('authorization')).toBe(false);
    expect(cabecalhos.get('content-type')).toBe('application/json');
  });

  it('resposta vazia (204) vira undefined', async () => {
    fetchFalso.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(requisicao('/v1/teste', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('erro no formato do doc 05 vira ErroApi com o código do catálogo', async () => {
    fetchFalso.mockResolvedValue(
      responder(403, {
        erro: {
          codigo: 'LIMITE_PLANO_ATINGIDO',
          mensagem: 'Você atingiu 3 lançamentos hoje.',
          detalhes: { recurso: 'lancamento' },
        },
      }),
    );
    const erro = await requisicao('/v1/teste').catch((motivo: unknown) => motivo);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({
      status: 403,
      codigo: 'LIMITE_PLANO_ATINGIDO',
      message: 'Você atingiu 3 lançamentos hoje.',
    });
  });

  it('erro fora do formato ainda vira ErroApi, sem código', async () => {
    fetchFalso.mockResolvedValue(responder(502, { mensagem: 'gateway' }));
    const erro = await requisicao('/v1/teste').catch((motivo: unknown) => motivo);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({ status: 502, codigo: undefined });
  });
});
