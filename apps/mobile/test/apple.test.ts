import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';

import { escolherContaApple } from '@/lib/auth/apple';

const mockNativo = { signInAsync: jest.fn<(opcoes: { nonce: string }) => Promise<unknown>>() };
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: (opcoes: { nonce: string }) => mockNativo.signInAsync(opcoes),
  isAvailableAsync: () => Promise.resolve(true),
}));
jest.mock('expo-crypto', () => {
  const { createHash: resumir, randomUUID } =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    randomUUID,
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
    digestStringAsync: (_algoritmo: string, texto: string) =>
      Promise.resolve(resumir('sha256').update(texto).digest('hex')),
  };
});

describe('entrar com a Apple (T-055b)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('manda à Apple o resumo do nonce e devolve o original para o servidor conferir', async () => {
    mockNativo.signInAsync.mockResolvedValue({
      identityToken: 'token-apple',
      fullName: { givenName: 'Ana', familyName: 'Souza' },
    });
    const conta = await escolherContaApple();
    expect(conta).toMatchObject({ idToken: 'token-apple', nome: 'Ana Souza' });
    const enviado = mockNativo.signInAsync.mock.calls[0]?.[0].nonce;
    expect(enviado).toBe(
      createHash('sha256')
        .update(conta?.nonce ?? '')
        .digest('hex'),
    );
    expect(conta?.nonce.length).toBeGreaterThanOrEqual(32);
  });

  it('desistir devolve null; sem nome, null', async () => {
    mockNativo.signInAsync.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    await expect(escolherContaApple()).resolves.toBeNull();
    mockNativo.signInAsync.mockResolvedValue({ identityToken: 't', fullName: null });
    await expect(escolherContaApple()).resolves.toMatchObject({ nome: null });
  });
});
