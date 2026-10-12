import { textosAuth } from '@/features/auth/auth.strings';
import { textosCartoes } from '@/features/cartoes/cartoes.strings';
import { textosCategorias } from '@/features/categorias/categorias.strings';
import { textosContas } from '@/features/contas/contas.strings';
import { textosInicio } from '@/features/inicio/inicio.strings';
import { textosMais } from '@/features/mais/mais.strings';
import { textosMetas } from '@/features/metas/metas.strings';
import { textosMony } from '@/features/mony/mony.strings';
import { textosOnboarding } from '@/features/onboarding/onboarding.strings';
import { textosOrcamentos } from '@/features/orcamentos/orcamentos.strings';
import { textosRelatorios } from '@/features/relatorios/relatorios.strings';
import { textosTransacoes } from '@/features/transacoes/transacoes.strings';
import { textosUi } from '@/ui/ui.strings';

import { textosComuns } from './comum.strings';

/** Todos os textos do app em pt-BR. Cada feature tem o seu `<feature>.strings.ts`. */
export const textosPtBr = {
  comum: textosComuns,
  ui: textosUi,
  auth: textosAuth,
  onboarding: textosOnboarding,
  inicio: textosInicio,
  transacoes: textosTransacoes,
  mony: textosMony,
  cartoes: textosCartoes,
  mais: textosMais,
  categorias: textosCategorias,
  contas: textosContas,
  orcamentos: textosOrcamentos,
  metas: textosMetas,
  relatorios: textosRelatorios,
};
