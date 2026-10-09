import { criarConfigEslint } from './eslint.js';

export default criarConfigEslint({
  tsconfigRootDir: import.meta.dirname,
  ignorados: ['test/fixtures/**'],
});
