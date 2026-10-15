import { criarConfigEslint } from '@mony/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  criarConfigEslint({
    tsconfigRootDir: import.meta.dirname,
    ignorados: ['src/rotas.gen.ts'],
  }),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    rules: {
      // O TanStack Router redireciona com `throw redirect(...)`, que não é um Error.
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', package: '@tanstack/router-core', name: 'Redirect' }] },
      ],
    },
  },
);
