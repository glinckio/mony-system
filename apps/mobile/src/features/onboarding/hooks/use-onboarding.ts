import {
  atualizarOnboardingUsuarios,
  getOnboardingUsuariosQueryKey,
  getPerfilUsuariosQueryKey,
  useOnboardingUsuarios,
} from '@mony/api-client';
import type { DadosAtualizacaoOnboarding, Onboarding } from '@mony/shared/usuario';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { aplicarAtualizacao } from '../lib/etapas';

/** Progresso do onboarding no servidor (`GET /me/onboarding`): etapas, checklist e dicas vistas. */
export function useOnboarding() {
  return useOnboardingUsuarios();
}

/**
 * `PATCH /me/onboarding`. Otimista: o passo e a dica mudam na tela na hora e voltam se a API
 * recusar. A resposta também atualiza o Início, que traz o mesmo onboarding.
 */
export function useAtualizarOnboarding() {
  const cliente = useQueryClient();
  const chave = getOnboardingUsuariosQueryKey();
  return useMutation({
    mutationFn: (dados: DadosAtualizacaoOnboarding) => atualizarOnboardingUsuarios(dados),
    onMutate: async (dados) => {
      await cliente.cancelQueries({ queryKey: chave });
      const anterior = cliente.getQueryData<Onboarding>(chave);
      if (anterior) cliente.setQueryData(chave, aplicarAtualizacao(anterior, dados));
      return { anterior };
    },
    onError: (_erro, _dados, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(chave, contexto.anterior);
    },
    onSuccess: (resposta) => {
      cliente.setQueryData(chave, resposta);
      void cliente.invalidateQueries({ queryKey: ['/v1/dashboard'] });
      void cliente.invalidateQueries({ queryKey: getPerfilUsuariosQueryKey() });
    },
  });
}
