// @ts-check
import comentarios from '@eslint-community/eslint-plugin-eslint-comments/configs';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const IGNORADOS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.expo/**',
];

const ARQUIVOS_TS = ['**/*.{ts,tsx,mts,cts}'];
const ARQUIVOS_JS = ['**/*.{js,jsx,mjs,cjs}'];

/**
 * Dinheiro é sempre em centavos inteiros (docs/arquitetura/03). Estes seletores pegam um número
 * com casas decimais escrito direto em um campo terminado em `Centavos`, como
 * `valorCentavos = 10.5` ou `{ totalCentavos: -0.5 }`.
 */
const DECIMAL = 'Literal[raw=/^\\d*\\.\\d/]';
const CAMPOS_CENTAVOS = [
  'VariableDeclarator[id.name=/Centavos$/]',
  'Property[key.name=/Centavos$/]',
  'PropertyDefinition[key.name=/Centavos$/]',
  'AssignmentPattern[left.name=/Centavos$/]',
  'AssignmentExpression[left.name=/Centavos$/]',
  'AssignmentExpression[left.property.name=/Centavos$/]',
];
const CENTAVOS_DECIMAL = CAMPOS_CENTAVOS.flatMap((campo) => [
  `${campo} > ${DECIMAL}`,
  `${campo} > UnaryExpression > ${DECIMAL}`,
]).join(', ');

/**
 * Monta a configuração do ESLint (flat config) usada por todos os pacotes do monorepo.
 *
 * @param {object} opcoes
 * @param {string} opcoes.tsconfigRootDir Pasta do pacote que consome a config (`import.meta.dirname`).
 * @param {string[]} [opcoes.ignorados] Padrões extras a ignorar, além de build, cobertura e cache.
 */
export function criarConfigEslint({ tsconfigRootDir, ignorados = [] }) {
  return defineConfig(
    { ignores: [...IGNORADOS, ...ignorados] },
    { linterOptions: { reportUnusedDisableDirectives: 'error' } },
    js.configs.recommended,
    {
      files: ARQUIVOS_TS,
      extends: [tseslint.configs.strictTypeChecked],
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      },
    },
    {
      files: ARQUIVOS_JS,
      languageOptions: { globals: globals.node },
    },
    comentarios.recommended,
    {
      rules: {
        // `any` (e qualquer outra regra desligada) só com justificativa: `-- motivo` no comentário.
        '@eslint-community/eslint-comments/require-description': [
          'error',
          { ignore: ['eslint-enable'] },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: CENTAVOS_DECIMAL,
            message:
              'Dinheiro é sempre em centavos inteiros: não use número com casas decimais em campo `...Centavos`. Converta com @mony/shared/dinheiro.',
          },
        ],
        eqeqeq: ['error', 'smart'],
      },
    },
    prettier,
  );
}
