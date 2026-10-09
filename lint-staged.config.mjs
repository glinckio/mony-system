// Roda no pre-commit (Husky) só sobre os arquivos em stage.
export default {
  '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  '*.{json,jsonc,yml,yaml,css}': 'prettier --write',
};
