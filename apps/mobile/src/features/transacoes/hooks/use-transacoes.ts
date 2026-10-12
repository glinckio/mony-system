import {
  buscarTransacoes,
  getBuscarTransacoesQueryKey,
  getListarTransacoesQueryKey,
  listarTransacoes,
  useListarCartoes,
  useListarCategorias,
  useListarContas,
  useListarRecorrencias,
  useTotaisTransacoes,
} from '@mony/api-client';
import type {
  ConsultaTransacoes,
  FiltroTransacoes,
  PaginaTransacoes,
  Transacao,
} from '@mony/shared/transacoes';
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

/** Lançamentos por página da lista (a API aceita até 100). */
export const TAMANHO_PAGINA = 30;

async function paginaDeTransacoes(
  consulta: Partial<ConsultaTransacoes>,
  signal: AbortSignal,
): Promise<PaginaTransacoes> {
  return await listarTransacoes(consulta, { signal });
}

/** Chave da lista paginada: começa pela rota, para a invalidação por prefixo pegar. */
function chaveDaLista(filtro: FiltroTransacoes) {
  return [...getListarTransacoesQueryKey(filtro), 'paginas'] as const;
}

/** RN-047: lista do filtro, por data e id decrescentes, página a página pelo cursor. */
export function useListaTransacoes(filtro: FiltroTransacoes) {
  return useInfiniteQuery({
    queryKey: chaveDaLista(filtro),
    queryFn: ({ pageParam, signal }) =>
      paginaDeTransacoes(
        { ...filtro, limite: TAMANHO_PAGINA, ...(pageParam === null ? {} : { cursor: pageParam }) },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

/** RN-047: receitas, despesas e saldo do mesmo filtro, calculados no servidor. */
export function useTotais(filtro: FiltroTransacoes) {
  return useTotaisTransacoes(filtro);
}

/** O lançamento que já está numa lista carregada, para o formulário abrir sem esperar a API. */
function procurarNasListas(
  cliente: QueryClient,
  id: string,
): { transacao: Transacao; atualizadoEm: number } | undefined {
  const listas = cliente.getQueryCache().findAll({ queryKey: getListarTransacoesQueryKey() });
  for (const consulta of listas) {
    // A mesma rota também guarda consultas sem paginação (`useListarTransacoes`), sem `pages`.
    const dados = consulta.state.data as Partial<InfiniteData<PaginaTransacoes>> | undefined;
    const transacao = dados?.pages?.flatMap(({ itens }) => itens).find((item) => item.id === id);
    if (transacao) return { transacao, atualizadoEm: consulta.state.dataUpdatedAt };
  }
  return undefined;
}

/** Um lançamento (`GET /transacoes/:id`), vindo da lista quando ela já o tem. */
export function useTransacao(id: string) {
  const cliente = useQueryClient();
  const daLista = procurarNasListas(cliente, id);
  return useQuery({
    queryKey: getBuscarTransacoesQueryKey(id),
    queryFn: async ({ signal }) => await buscarTransacoes(id, { signal }),
    initialData: daLista?.transacao,
    initialDataUpdatedAt: daLista?.atualizadoEm,
  });
}

/** Categorias, contas, cartões e recorrências: os nomes que a lista e o formulário mostram. */
export function useCatalogos() {
  const categorias = useListarCategorias();
  const contas = useListarContas();
  const cartoes = useListarCartoes();
  const recorrencias = useListarRecorrencias();
  return {
    categorias: categorias.data?.itens ?? [],
    contas: contas.data?.itens ?? [],
    cartoes: cartoes.data?.itens ?? [],
    recorrencias: recorrencias.data?.itens ?? [],
  };
}

export type Catalogos = ReturnType<typeof useCatalogos>;
