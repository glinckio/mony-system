import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { textosPtBr } from './pt-br';

/** Só pt-BR no lançamento, mas nenhum texto de tela fica fixo em componente (docs/arquitetura/02). */
export const IDIOMA = 'pt-BR';

void i18n.use(initReactI18next).init({
  resources: { [IDIOMA]: { traducao: textosPtBr } },
  lng: IDIOMA,
  fallbackLng: IDIOMA,
  defaultNS: 'traducao',
  // Os textos estão no bundle: a inicialização termina antes da primeira tela.
  initAsync: false,
  // O React já escapa o texto.
  interpolation: { escapeValue: false },
});

export default i18n;
