import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { textosPtBr } from './pt-br';

/** Só pt-BR, mas nenhum texto de tela fica fixo em componente (docs/arquitetura/03). */
void i18n.use(initReactI18next).init({
  resources: { 'pt-BR': { traducao: textosPtBr } },
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  defaultNS: 'traducao',
  initAsync: false,
  interpolation: { escapeValue: false },
});

export default i18n;
