import { criarConfigEslint } from '@mony/config/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  criarConfigEslint({
    tsconfigRootDir: import.meta.dirname,
    ignorados: ['src/generated/**'],
  }),
  {
    files: ['src/**/*.ts'],
    ignores: ['src/core/openapi/dto.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'nestjs-zod',
              importNames: ['createZodDto'],
              message:
                'Use o `criarDto` de `src/core/openapi/dto`: ele acerta os campos que aceitam nulo no contrato (T-018).',
            },
          ],
        },
      ],
    },
  },
);
