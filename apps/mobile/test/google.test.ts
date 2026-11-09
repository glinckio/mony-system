import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { escolherContaGoogle } from '@/lib/auth/google';
import { configApp } from '@/lib/config';

const mockNativo = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(() => Promise.resolve(true)),
  signIn: jest.fn<() => Promise<unknown>>(),
  signOut: jest.fn(() => Promise.resolve(null)),
  revokeAccess: jest.fn(() => Promise.resolve(null)),
};
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: mockNativo,
  isCancelledResponse: (resposta: { type: string }) => resposta.type === 'cancelled',
  isErrorWithCode: (erro: unknown) => typeof erro === 'object' && erro !== null && 'code' in erro,
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));

describe('escolha da conta do Google (T-055a)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('pede o id_token para o cliente web e desfaz o acesso depois (T-055c: token novo a cada vez)', async () => {
    configApp.googleIdClienteWeb = 'cliente-web.apps.googleusercontent.com';
    mockNativo.signIn.mockResolvedValue({
      type: 'success',
      data: { idToken: 'token', user: { name: 'Ana Souza' } },
    });
    await expect(escolherContaGoogle()).resolves.toEqual({ idToken: 'token', nome: 'Ana Souza' });
    expect(mockNativo.configure).toHaveBeenCalledWith({
      webClientId: 'cliente-web.apps.googleusercontent.com',
    });
    expect(mockNativo.revokeAccess).toHaveBeenCalledTimes(1);
    expect(mockNativo.signOut).toHaveBeenCalledTimes(1);
  });

  it('desistir devolve null', async () => {
    mockNativo.signIn.mockResolvedValue({ type: 'cancelled', data: null });
    await expect(escolherContaGoogle()).resolves.toBeNull();
    // Sem conta escolhida, não há acesso para desfazer.
    expect(mockNativo.revokeAccess).not.toHaveBeenCalled();
    mockNativo.signIn.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'SIGN_IN_CANCELLED' }),
    );
    await expect(escolherContaGoogle()).resolves.toBeNull();
  });

  it('erro de configuração (DEVELOPER_ERROR) chega à tela', async () => {
    mockNativo.signIn.mockRejectedValue(
      Object.assign(new Error('DEVELOPER_ERROR'), { code: '10' }),
    );
    await expect(escolherContaGoogle()).rejects.toThrow('DEVELOPER_ERROR');
  });
});
