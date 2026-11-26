import {
  atualizarTiposLista,
  criarTiposLista,
  excluirTiposLista,
  getListarListasQueryKey,
  getListarTiposListaQueryKey,
  listarTiposLista,
} from '@mony/api-client';
import type { DadosAtualizacaoTipoLista, DadosNovoTipoLista } from '@mony/shared/listas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Os tipos de lista do usuário (T-123d), na ordem em que foram criados. */
export function useTiposLista() {
  return useQuery({
    queryKey: getListarTiposListaQueryKey(),
    queryFn: async ({ signal }) => await listarTiposLista({ signal }),
  });
}

/** Mudar um tipo muda o nome e a categoria das listas dele: refaz os tipos e as listas. */
function useAoMudar() {
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: getListarTiposListaQueryKey() });
    void cliente.invalidateQueries({ queryKey: getListarListasQueryKey() });
    void cliente.invalidateQueries({ queryKey: ['/v1/listas'] });
  };
}

export function useCriarTipoLista() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (dados: DadosNovoTipoLista) => criarTiposLista(dados),
    onSuccess: aoMudar,
  });
}

export function useAtualizarTipoLista() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: DadosAtualizacaoTipoLista }) =>
      atualizarTiposLista(id, dados),
    onSuccess: aoMudar,
  });
}

/** Com listas no tipo, elas vão para `moverPara`. */
export function useExcluirTipoLista() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, moverPara }: { id: string; moverPara: string | null }) =>
      excluirTiposLista(id, moverPara === null ? {} : { mover_para: moverPara }),
    onSuccess: aoMudar,
  });
}
