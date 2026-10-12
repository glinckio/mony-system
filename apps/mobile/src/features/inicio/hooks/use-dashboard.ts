import { getObterDashboardQueryKey, obterDashboard } from '@mony/api-client';
import type { ConsultaDashboard } from '@mony/shared/dashboard';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

/**
 * O Início com uma chamada (`GET /dashboard`, RN-020 a RN-024): resumo do período, próximos
 * vencimentos, cartões, orçamentos, onboarding e o contador de notificações. Ao trocar o período,
 * a tela segue com o anterior até o novo chegar.
 */
export function useDashboard(consulta: ConsultaDashboard) {
  const { periodo, de, ate } = consulta;
  const parametros =
    periodo === 'personalizado' && de !== undefined && ate !== undefined
      ? { periodo, de, ate }
      : { periodo };
  return useQuery({
    queryKey: getObterDashboardQueryKey(parametros),
    queryFn: async ({ signal }) => await obterDashboard(parametros, { signal }),
    placeholderData: keepPreviousData,
  });
}
