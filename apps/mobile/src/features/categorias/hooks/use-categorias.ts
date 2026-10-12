import {
  atualizarCategorias,
  criarCategorias,
  excluirCategorias,
  useListarCategorias,
} from '@mony/api-client';
import type { DadosAtualizacaoCategoria, DadosNovaCategoria } from '@mony/shared/categorias';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';

/** Categorias do usuário (`GET /categorias`), dos dois tipos, ordenadas por tipo e nome. */
export function useCategorias() {
  return useListarCategorias();
}

/**
 * Mudar categoria muda os nomes nas listas e, ao excluir, os lançamentos e orçamentos dela (RN-066):
 * refaz as categorias e os dados financeiros.
 */
function useAoMudar() {
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: ['/v1/categorias'] });
    void invalidarDadosFinanceiros(cliente);
  };
}

export function useCriarCategoria() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (dados: DadosNovaCategoria) => criarCategorias(dados),
    onSuccess: aoMudar,
  });
}

export function useAtualizarCategoria() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: DadosAtualizacaoCategoria }) =>
      atualizarCategorias(id, dados),
    onSuccess: aoMudar,
  });
}

/** RN-066: os lançamentos vão para `moverPara`, do mesmo tipo; os orçamentos dela saem. */
export function useExcluirCategoria() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, moverPara }: { id: string; moverPara: string }) =>
      excluirCategorias(id, { mover_para: moverPara }),
    onSuccess: aoMudar,
  });
}
