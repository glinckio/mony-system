import {
  adicionarItemListas,
  atualizarItensLista,
  atualizarListas,
  buscarListas,
  criarListas,
  excluirItensLista,
  excluirListas,
  finalizarListas,
  getBuscarListasQueryKey,
  getListarListasQueryKey,
  listarListas,
} from '@mony/api-client';
import type {
  DadosAtualizacaoItemLista,
  DadosAtualizacaoLista,
  DadosFinalizacaoLista,
  DadosNovaLista,
  DadosNovoItemLista,
  DetalheLista,
} from '@mony/shared/listas';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';
import { ouvirLista } from '@/lib/tempo-real';

import { comItemMarcado } from '../lib/listas';

/** As abertas (a mais nova primeiro) e as últimas finalizadas. */
export function useListas() {
  return useQuery({
    queryKey: getListarListasQueryKey(),
    queryFn: async ({ signal }) => await listarListas({ signal }),
  });
}

/** A lista com os itens, o preço sugerido e o orçamento livre (RN-071, RN-073). */
export function useLista(id: string) {
  return useQuery({
    queryKey: getBuscarListasQueryKey(id),
    queryFn: async ({ signal }) => await buscarListas(id, { signal }),
  });
}

/**
 * A lista aberta muda na hora quando outra pessoa mexe nela (RN-074, T-124b): a cada aviso, a lista
 * e as listas buscam de novo (o aviso não leva os dados). Só a compartilhada ouve.
 */
export function useListaAoVivo(id: string, compartilhada: boolean) {
  const cliente = useQueryClient();
  useEffect(() => {
    if (!compartilhada) return undefined;
    return ouvirLista(id, () => {
      void cliente.invalidateQueries({ queryKey: getBuscarListasQueryKey(id), exact: true });
      void invalidarListas(cliente);
    });
  }, [cliente, id, compartilhada]);
}

/** A lista de listas e o uso do plano (RN-120: no gratuito, uma lista aberta). */
function invalidarListas(cliente: QueryClient) {
  return cliente.invalidateQueries({
    predicate: ({ queryKey }) => {
      const [rota] = queryKey;
      return rota === getListarListasQueryKey()[0] || rota === '/v1/assinatura/uso';
    },
  });
}

/** A resposta de uma mudança já é a lista nova: vai para o cache sem buscar de novo. */
function useAoMudarLista() {
  const cliente = useQueryClient();
  return (lista: DetalheLista) => {
    cliente.setQueryData(getBuscarListasQueryKey(lista.id), lista);
    void invalidarListas(cliente);
  };
}

export function useCriarLista() {
  const aoMudar = useAoMudarLista();
  return useMutation({
    mutationFn: async (dados: DadosNovaLista) => await criarListas(dados),
    onSuccess: aoMudar,
  });
}

/** Nome ou tipo da lista. */
export function useAtualizarLista() {
  const aoMudar = useAoMudarLista();
  return useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: DadosAtualizacaoLista }) =>
      await atualizarListas(id, dados),
    onSuccess: aoMudar,
  });
}

/** Apaga a lista e os itens; a despesa de uma finalizada continua. */
export function useExcluirLista() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => excluirListas(id),
    onSuccess: (_resposta, id) => {
      // A excluída fica velha sem buscar de novo: a resposta seria 404 na tela que está fechando.
      void cliente.invalidateQueries({
        queryKey: getBuscarListasQueryKey(id),
        exact: true,
        refetchType: 'none',
      });
      void invalidarListas(cliente);
    },
  });
}

/** RN-070; sem preço, a API sugere o último pago num item parecido (RN-071). */
export function useAdicionarItem(listaId: string) {
  const aoMudar = useAoMudarLista();
  return useMutation({
    mutationFn: async (dados: DadosNovoItemLista) => await adicionarItemListas(listaId, dados),
    onSuccess: aoMudar,
  });
}

/**
 * Muda o item. Marcar e desmarcar comprado aparece na hora (no mercado, a pessoa marca vários
 * seguidos); se a API falhar, a caixa volta.
 */
export function useAtualizarItem(listaId: string) {
  const cliente = useQueryClient();
  const aoMudar = useAoMudarLista();
  const chave = getBuscarListasQueryKey(listaId);
  return useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: DadosAtualizacaoItemLista }) =>
      await atualizarItensLista(id, dados),
    onMutate: async ({ id, dados }) => {
      if (dados.comprado === undefined) return { antes: undefined };
      await cliente.cancelQueries({ queryKey: chave, exact: true });
      const antes = cliente.getQueryData<DetalheLista>(chave);
      if (antes) cliente.setQueryData(chave, comItemMarcado(antes, id, dados.comprado));
      return { antes };
    },
    onError: (_erro, _variaveis, contexto) => {
      if (contexto?.antes) cliente.setQueryData(chave, contexto.antes);
    },
    onSuccess: aoMudar,
  });
}

/** Tira o item; a resposta é a lista sem ele. */
export function useExcluirItem() {
  const aoMudar = useAoMudarLista();
  return useMutation({
    mutationFn: async (itemId: string) => await excluirItensLista(itemId),
    onSuccess: aoMudar,
  });
}

/**
 * RN-072: lança a despesa com os comprados e fecha a lista. A `Idempotency-Key` é a mesma em todas
 * as tentativas da mesma folha: repetir depois de uma falha de rede não lança duas.
 */
export function useFinalizarLista() {
  const cliente = useQueryClient();
  const aoMudar = useAoMudarLista();
  return useMutation({
    mutationFn: async ({
      id,
      dados,
      chave,
    }: {
      id: string;
      dados: DadosFinalizacaoLista;
      chave: string;
    }) => await finalizarListas(id, dados, { headers: { 'Idempotency-Key': chave } }),
    onSuccess: (lista) => {
      aoMudar(lista);
      void invalidarDadosFinanceiros(cliente);
    },
  });
}
