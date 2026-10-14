/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/test/preparar-jest.ts'],
  // O CSS do NativeWind é compilado pelo Metro; nos testes, o import do `global.css` fica vazio.
  moduleNameMapper: {
    '\\.css$': '<rootDir>/test/estilo-vazio.ts',
    // Os ícones do Lucide vêm em ESM (.mjs) para o Metro; o Jest usa a versão CommonJS deles.
    '^lucide-react-native/icons/(.*)$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
  // Testes ficam fora de `app/`, que o Expo Router lê como rotas.
  testMatch: ['<rootDir>/{src,test}/**/*.test.{ts,tsx}'],
  // No CI, cada falha também vira anotação do GitHub, que dá para ler pela API sem baixar o log.
  reporters: process.env.GITHUB_ACTIONS === 'true' ? ['default', 'github-actions'] : ['default'],
};
