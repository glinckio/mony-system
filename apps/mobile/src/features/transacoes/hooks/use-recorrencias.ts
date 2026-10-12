import {
  atualizarRecorrencias,
  buscarRecorrencias,
  criarRecorrencias,
  excluirRecorrencias,
  getBuscarRecorrenciasQueryKey,
} from '@mony/api-client';
import type { DadosAtualizacaoRecorrencia, DadosNovaRecorrencia } from '@mony/shared/recorrencias';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';

/** A recorrência (`GET /recorrencias/:id`), também a que já parou. */
export function useRecorrencia(id: string) {
  return useQuery({
    queryKey: getBuscarRecorrenciasQueryKey(id),
    queryFn: async ({ signal }) => await buscarRecorrencias(id, { signal }),
  });
}

/** Recorrência muda as ocorrências (e as faturas, no cartão): refaz os dados financeiros. */
function useAoMudar() {
  const cliente = useQueryClient();
  return () => {
    void invalidarDadosFinanceiros(cliente);
  };
}

/**
 * `POST /recorrencias` (RN-043), com a `Idempotency-Key` do formulário: repetir depois de uma
 * falha de rede não cria duas.
 */
export function useCriarRecorrencia() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ dados, chave }: { dados: DadosNovaRecorrencia; chave: string }) =>
      criarRecorrencias(dados, { headers: { 'Idempotency-Key': chave } }),
    onSuccess: aoMudar,
  });
}

/** `PATCH /recorrencias/:id`: muda o modelo e as ocorrências futuras pendentes não editadas. */
export function useAtualizarRecorrencia() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: DadosAtualizacaoRecorrencia }) =>
      atualizarRecorrencias(id, dados),
    onSuccess: aoMudar,
  });
}

/** `DELETE /recorrencias/:id`: para; as ocorrências livres de hoje em diante saem. */
export function useExcluirRecorrencia() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (id: string) => excluirRecorrencias(id),
    onSuccess: aoMudar,
  });
}
