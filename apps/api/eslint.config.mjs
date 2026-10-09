import { criarConfigEslint } from '@mony/config/eslint';

export default criarConfigEslint({
  tsconfigRootDir: import.meta.dirname,
  ignorados: ['src/generated/**'],
});
