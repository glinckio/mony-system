import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verificarSaude } from './gerado';
import { clienteConfigurado, configurarCliente, ErroApi, requisicao } from './requisicao';

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
  it('sabe se já foi configurado (a tarefa do push sem a tela, T-088b)', () => {
    expect(clienteConfigurado()).toBe(true);
    configurarCliente({ urlBase: '' });
    expect(clienteConfigurado()).toBe(false);
  });

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

  it('avisa o erro da API antes de falhar (a atualização obrigatória do app)', async () => {
    const aoErro = vi.fn<(erro: ErroApi) => void>();
    configurarCliente({ urlBase: 'https://api.teste', aoErro });
    fetchFalso.mockResolvedValue(
      responder(426, {
        erro: {
          codigo: 'VERSAO_APP_DESATUALIZADA',
          mensagem: 'Atualize o app.',
          detalhes: { plataforma: 'ios', versaoMinima: '1.2.0' },
        },
      }),
    );
    await expect(requisicao('/v1/teste')).rejects.toMatchObject({
      status: 426,
      codigo: 'VERSAO_APP_DESATUALIZADA',
    });
    expect(aoErro).toHaveBeenCalledTimes(1);
    expect(aoErro.mock.calls[0]?.[0]).toBeInstanceOf(ErroApi);

    fetchFalso.mockResolvedValue(responder(200, { ok: true }));
    await requisicao('/v1/teste');
    expect(aoErro).toHaveBeenCalledTimes(1);
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

describe('cabeçalhos e renovação da sessão (doc 04)', () => {
  it('manda os cabeçalhos do app sem sobrescrever os da chamada', async () => {
    configurarCliente({
      urlBase: 'https://api.teste',
      cabecalhos: () => ({ 'x-app-version': '1.2.3', 'x-platform': 'ios', 'idempotency-key': 'x' }),
    });
    fetchFalso.mockResolvedValue(responder(200, {}));
    await requisicao('/v1/teste', { headers: { 'idempotency-key': 'da-chamada' } });
    const cabecalhos = new Headers(fetchFalso.mock.calls[0]?.[1]?.headers);
    expect(cabecalhos.get('x-app-version')).toBe('1.2.3');
    expect(cabecalhos.get('x-platform')).toBe('ios');
    expect(cabecalhos.get('idempotency-key')).toBe('da-chamada');
  });

  it('três 401 ao mesmo tempo: uma renovação só e as três repetidas com o token novo', async () => {
    let token = 'velho';
    let liberar: (renovou: boolean) => void = () => undefined;
    const renovarSessao = vi.fn(
      () =>
        new Promise<boolean>((resolver) => {
          liberar = (renovou) => {
            token = 'novo';
            resolver(renovou);
          };
        }),
    );
    configurarCliente({ urlBase: 'https://api.teste', obterToken: () => token, renovarSessao });
    fetchFalso.mockImplementation((_url, opcoes) =>
      Promise.resolve(
        new Headers(opcoes?.headers).get('authorization') === 'Bearer novo'
          ? responder(200, { ok: true })
          : responder(401, {
              erro: { codigo: 'TOKEN_EXPIRADO', mensagem: 'Expirou', detalhes: null },
            }),
      ),
    );

    const pedidos = Promise.all([1, 2, 3].map((n) => requisicao(`/v1/teste/${String(n)}`)));
    await vi.waitFor(() => {
      expect(fetchFalso).toHaveBeenCalledTimes(3);
    });
    liberar(true);

    await expect(pedidos).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(renovarSessao).toHaveBeenCalledTimes(1);
    expect(fetchFalso).toHaveBeenCalledTimes(6);
  });

  it('renovação recusada (ou que falha) devolve o 401; sem token ou em /v1/auth e /v1/admin/auth não tenta renovar', async () => {
    const renovarSessao = vi.fn(() => Promise.resolve(false));
    configurarCliente({ urlBase: 'https://api.teste', obterToken: () => 't', renovarSessao });
    fetchFalso.mockImplementation(() =>
      Promise.resolve(
        responder(401, { erro: { codigo: 'TOKEN_EXPIRADO', mensagem: 'Expirou', detalhes: null } }),
      ),
    );
    await expect(requisicao('/v1/teste')).rejects.toMatchObject({
      status: 401,
      codigo: 'TOKEN_EXPIRADO',
    });
    expect(fetchFalso).toHaveBeenCalledTimes(1);

    renovarSessao.mockRejectedValueOnce(new Error('sem rede'));
    await expect(requisicao('/v1/teste')).rejects.toBeInstanceOf(ErroApi);

    renovarSessao.mockClear();
    await expect(requisicao('/v1/auth/renovar', { method: 'POST' })).rejects.toBeInstanceOf(
      ErroApi,
    );
    await expect(requisicao('/v1/admin/auth/renovar', { method: 'POST' })).rejects.toBeInstanceOf(
      ErroApi,
    );
    configurarCliente({ urlBase: 'https://api.teste', renovarSessao });
    await expect(requisicao('/v1/teste', { method: 'POST' })).rejects.toBeInstanceOf(ErroApi);
    expect(renovarSessao).not.toHaveBeenCalled();
  });

  it('Authorization passado na chamada vence o token configurado', async () => {
    configurarCliente({ urlBase: 'https://api.teste', obterToken: () => 'do-app' });
    fetchFalso.mockImplementation(() => Promise.resolve(responder(200, { ok: true })));
    await requisicao('/v1/admin/auth/2fa', { headers: { authorization: 'Bearer desafio' } });
    const [, opcoes] = fetchFalso.mock.calls[0] ?? [];
    expect(new Headers(opcoes?.headers).get('authorization')).toBe('Bearer desafio');
  });
});
