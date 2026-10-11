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
