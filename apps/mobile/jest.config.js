/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/test/preparar-jest.ts'],
  // O CSS do NativeWind é compilado pelo Metro; nos testes, o import do `global.css` fica vazio.
  moduleNameMapper: { '\\.css$': '<rootDir>/test/estilo-vazio.ts' },
  // Testes ficam fora de `app/`, que o Expo Router lê como rotas.
  testMatch: ['<rootDir>/{src,test}/**/*.test.{ts,tsx}'],
};
