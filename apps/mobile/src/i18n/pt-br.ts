import { textosAuth } from '@/features/auth/auth.strings';
import { textosCartoes } from '@/features/cartoes/cartoes.strings';
import { textosInicio } from '@/features/inicio/inicio.strings';
import { textosMais } from '@/features/mais/mais.strings';
import { textosMony } from '@/features/mony/mony.strings';
import { textosOnboarding } from '@/features/onboarding/onboarding.strings';
import { textosTransacoes } from '@/features/transacoes/transacoes.strings';

import { textosComuns } from './comum.strings';

/** Todos os textos do app em pt-BR. Cada feature tem o seu `<feature>.strings.ts`. */
export const textosPtBr = {
  comum: textosComuns,
  auth: textosAuth,
  onboarding: textosOnboarding,
  inicio: textosInicio,
  transacoes: textosTransacoes,
  mony: textosMony,
  cartoes: textosCartoes,
  mais: textosMais,
};
