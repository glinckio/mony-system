import { jest } from '@jest/globals';

// Nos testes o app roda com a configuração de desenvolvimento, a mesma do `expo start` sem `.env`.
jest.mock('expo-constants', () => {
  const real = jest.requireActual<{ default: object }>('expo-constants');
  const { criarConfigApp } = jest.requireActual<typeof import('../app.config')>('../app.config');
  return {
    __esModule: true,
    default: { ...real.default, expoConfig: criarConfigApp({ name: 'teste', slug: 'teste' }, {}) },
  };
});

// O AsyncStorage (modo privacidade) em memória.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Fontes dos ícones como já carregadas: sem isso o ícone se atualiza depois do teste.
jest.mock('expo-font', () => ({
  ...jest.requireActual<object>('expo-font'),
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));

// Cofre do aparelho (Keychain/Keystore) em memória; `cofreFalso` limpa entre testes.
jest.mock('expo-secure-store', () => {
  const guardados = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    getItemAsync: jest.fn((chave: string) => Promise.resolve(guardados.get(chave) ?? null)),
    setItemAsync: (chave: string, valor: string) => {
      guardados.set(chave, valor);
      return Promise.resolve();
    },
    deleteItemAsync: (chave: string) => {
      guardados.delete(chave);
      return Promise.resolve();
    },
    __guardados: guardados,
  };
});

// Biometria: os testes dizem se o aparelho tem e se a pessoa confirma.
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID(),
}));
