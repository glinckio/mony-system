/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/test/preparar-jest.ts'],
  // Testes ficam fora de `app/`, que o Expo Router lê como rotas.
  testMatch: ['<rootDir>/{src,test}/**/*.test.{ts,tsx}'],
};
