import { defineConfig } from 'orval';

/**
 * Gera, a partir de `openapi.json` (exportado da API), as funções e os hooks TanStack Query em
 * `src/gerado`, um arquivo por tag. As requisições passam por `src/requisicao.ts`.
 */
export default defineConfig({
  mony: {
    input: { target: './openapi.json' },
    output: {
      target: './src/gerado/endpoints.ts',
      schemas: './src/gerado/modelos',
      mode: 'tags-split',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      formatter: 'prettier',
      override: {
        mutator: { path: './src/requisicao.ts', name: 'requisicao' },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
});
