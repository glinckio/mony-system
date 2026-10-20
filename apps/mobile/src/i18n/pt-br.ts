import { textosAgenda } from '@/features/agenda/agenda.strings';
import { textosAlarmes } from '@/features/alarmes/alarmes.strings';
import { textosAppsDeCompra } from '@/features/apps-de-compra/apps-de-compra.strings';
import { textosAtualizacao } from '@/features/atualizacao/atualizacao.strings';
import { textosAuth } from '@/features/auth/auth.strings';
import { textosCartoes } from '@/features/cartoes/cartoes.strings';
import { textosCategorias } from '@/features/categorias/categorias.strings';
import { textosCompartilhamentos } from '@/features/compartilhamentos/compartilhamentos.strings';
import { textosContas } from '@/features/contas/contas.strings';
import { textosInicio } from '@/features/inicio/inicio.strings';
import { textosLembretes } from '@/features/lembretes/lembretes.strings';
import { textosListas } from '@/features/listas/listas.strings';
import { textosMais } from '@/features/mais/mais.strings';
import { textosMetas } from '@/features/metas/metas.strings';
import { textosMony } from '@/features/mony/mony.strings';
import { textosNotificacoes } from '@/features/notificacoes/notificacoes.strings';
import { textosOnboarding } from '@/features/onboarding/onboarding.strings';
import { textosOrcamentos } from '@/features/orcamentos/orcamentos.strings';
import { textosPlanos } from '@/features/planos/planos.strings';
import { textosRelatorios } from '@/features/relatorios/relatorios.strings';
import { textosTransacoes } from '@/features/transacoes/transacoes.strings';
import { textosUi } from '@/ui/ui.strings';

import { textosComuns } from './comum.strings';

/** Todos os textos do app em pt-BR. Cada feature tem o seu `<feature>.strings.ts`. */
export const textosPtBr = {
  comum: textosComuns,
  ui: textosUi,
  auth: textosAuth,
  atualizacao: textosAtualizacao,
  onboarding: textosOnboarding,
  inicio: textosInicio,
  transacoes: textosTransacoes,
  mony: textosMony,
  notificacoes: textosNotificacoes,
  cartoes: textosCartoes,
  mais: textosMais,
  appsDeCompra: textosAppsDeCompra,
  alarmes: textosAlarmes,
  categorias: textosCategorias,
  contas: textosContas,
  orcamentos: textosOrcamentos,
  metas: textosMetas,
  lembretes: textosLembretes,
  agenda: textosAgenda,
  listas: textosListas,
  compartilhamentos: textosCompartilhamentos,
  relatorios: textosRelatorios,
  planos: textosPlanos,
};
