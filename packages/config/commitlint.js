// @ts-check
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** ID de tarefa do BACKLOG (`T-031`, `T-031a`) ou hotfix (`T-HOTFIX`). */
const ESCOPO_TAREFA = /^T-(\d{3}[a-z]?|HOTFIX)$/;
/** Escopo de domínio em kebab-case minúsculo, como no doc 03 (`cartoes`, `preferencias-alerta`). */
const ESCOPO_DOMINIO = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PARECE_TAREFA = /^t-?\d/i;

/** @type {import('@commitlint/types').Rule} */
function escopoMony(parsed) {
  const escopo = parsed.scope ?? '';
  // Escopo vazio já é recusado pela regra `scope-empty`.
  if (escopo === '' || ESCOPO_TAREFA.test(escopo)) return [true];
  if (PARECE_TAREFA.test(escopo)) {
    return [false, 'escopo de tarefa usa o ID do BACKLOG em maiúsculas, ex.: feat(T-031): ...'];
  }
  if (ESCOPO_DOMINIO.test(escopo)) return [true];
  return [
    false,
    'escopo deve ser o ID da tarefa (T-031) ou um domínio em kebab-case minúsculo (cartoes)',
  ];
}

/**
 * Conventional Commits em português com o ID da tarefa no escopo (CLAUDE.md, seção 5).
 * Ex.: `feat(T-031): calcula fatura pela data de fechamento [RN-031, RN-032]`
 *
 * @type {import('@commitlint/types').UserConfig}
 */
const config = {
  extends: [require.resolve('@commitlint/config-conventional')],
  plugins: [{ rules: { 'escopo-mony': escopoMony } }],
  rules: {
    'scope-empty': [2, 'never'],
    'scope-case': [0],
    'escopo-mony': [2, 'always'],
  },
  helpUrl: 'https://github.com/glinckio/mony-system/blob/main/CLAUDE.md#5-durante-o-trabalho',
};

export default config;
