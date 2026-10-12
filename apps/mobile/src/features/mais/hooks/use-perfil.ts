import {
  atualizarPerfilUsuarios,
  getPerfilUsuariosQueryKey,
  usePerfilUsuarios,
} from '@mony/api-client';
import type { DadosAtualizacaoPerfil } from '@mony/shared/usuario';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSessao } from '@/stores/sessao';

/** O perfil de quem está logado (`GET /me`). */
export function usePerfil() {
  return usePerfilUsuarios();
}

/** `PATCH /me`: só o que mudou. O nome novo também vai para a sessão (as iniciais do app). */
export function useAtualizarPerfil() {
  const cliente = useQueryClient();
  const mudarNome = useSessao((estado) => estado.mudarNome);
  return useMutation({
    mutationFn: (dados: DadosAtualizacaoPerfil) => atualizarPerfilUsuarios(dados),
    onSuccess: (perfil) => {
      cliente.setQueryData(getPerfilUsuariosQueryKey(), perfil);
      mudarNome(perfil.nome);
    },
  });
}
