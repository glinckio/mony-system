import { usePerfilUsuarios } from '@mony/api-client';
import { type DataCalendario, dataNoFuso, FUSO_PADRAO } from '@mony/shared/datas';

import { relogio } from './relogio';

/**
 * Fuso do usuário, do perfil (`GET /v1/me`). "Hoje" e "mês atual" são os dele, os mesmos que a API
 * usa (ADR-008). Até o perfil chegar, vale o fuso padrão.
 */
export function useFusoDoUsuario(): string {
  const { data } = usePerfilUsuarios({ query: { staleTime: 5 * 60_000 } });
  return data?.fusoHorario ?? FUSO_PADRAO;
}

/** O "hoje" do usuário, no fuso dele. */
export function useHoje(): DataCalendario {
  return dataNoFuso(relogio.agora(), useFusoDoUsuario());
}
