import {
  type DadosAtualizacaoOnboarding,
  type EtapaOnboarding,
  type Onboarding,
} from '@mony/shared/usuario';
import type { Href } from 'expo-router';

/**
 * Para onde leva o "Fazer agora" de cada passo do checklist. Sem rota, o passo só pode ser
 * dispensado: o tour é concluído ao fechar a primeira dica.
 */
export const ROTA_DA_ETAPA: Record<EtapaOnboarding, Href | null> = {
  'primeiro-lancamento': '/transacoes/nova',
  cartoes: '/cartoes',
  orcamento: '/orcamentos',
  permissoes: '/mais/permissoes',
  tour: null,
};

export function etapasPendentes(onboarding: Pick<Onboarding, 'etapas'>): EtapaOnboarding[] {
  return onboarding.etapas
    .filter(({ situacao }) => situacao === 'pendente')
    .map(({ etapa }) => etapa);
}

/** Concluídas e dispensadas contam como feitas no anel do checklist (RN-024). */
export function contarFeitas(onboarding: Pick<Onboarding, 'etapas'>): number {
  return onboarding.etapas.length - etapasPendentes(onboarding).length;
}

export function etapaPendente(onboarding: Pick<Onboarding, 'etapas'>, etapa: EtapaOnboarding) {
  return etapasPendentes(onboarding).includes(etapa);
}

/**
 * O que a API vai responder ao `PATCH /me/onboarding`, para a tela mudar antes da resposta:
 * concluída vale mais que dispensada, nenhuma etapa volta a pendente e o checklist some quando
 * não sobra pendente (RN-024; `montarOnboarding` na API). A resposta da API substitui isto.
 */
export function aplicarAtualizacao(
  atual: Onboarding,
  dados: DadosAtualizacaoOnboarding,
): Onboarding {
  const etapas = atual.etapas.map((item) => {
    const nova = dados.etapas?.[item.etapa];
    if (nova === undefined || item.situacao === 'concluida') return item;
    if (nova === 'dispensada' && item.situacao === 'dispensada') return item;
    return { ...item, situacao: nova };
  });
  return {
    concluido: dados.concluido ?? atual.concluido,
    etapas,
    checklistVisivel: etapas.some(({ situacao }) => situacao === 'pendente'),
    dicasVistas: [...new Set([...atual.dicasVistas, ...(dados.dicasVistas ?? [])])].sort(),
  };
}
