import {
  atualizarPerfilUsuarios,
  getPerfilUsuariosQueryKey,
  pedirCodigoTelefoneUsuarios,
  usePerfilUsuarios,
  verificarTelefoneUsuarios,
} from '@mony/api-client';
import type { DadosAtualizacaoPerfil, DadosVerificacaoTelefone } from '@mony/shared/usuario';
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

/** RN-078: o código de 6 dígitos por SMS para o celular do perfil (`POST /me/telefone/codigo`). */
export function usePedirCodigoTelefone() {
  return useMutation({ mutationFn: () => pedirCodigoTelefoneUsuarios() });
}

/** `POST /me/telefone/verificar`: o perfil volta com o celular verificado. */
export function useVerificarTelefone() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (dados: DadosVerificacaoTelefone) => verificarTelefoneUsuarios(dados),
    onSuccess: (perfil) => {
      cliente.setQueryData(getPerfilUsuariosQueryKey(), perfil);
    },
  });
}
