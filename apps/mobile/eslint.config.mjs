import { criarConfigEslint } from '@mony/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  criarConfigEslint({
    tsconfigRootDir: import.meta.dirname,
    ignorados: ['android/**', 'ios/**', 'expo-env.d.ts'],
  }),
  {
    files: ['**/*.{ts,tsx}'],
    // Regras dos hooks e do React Compiler (ligado no app.config.ts).
    extends: [reactHooks.configs.flat.recommended],
  },
);
