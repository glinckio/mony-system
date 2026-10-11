import 'i18next';

import type { textosPtBr } from './pt-br';

/** Chave de texto inexistente vira erro de compilação: `t('cartoes.titulo')`. */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'traducao';
    resources: { traducao: typeof textosPtBr };
  }
}
