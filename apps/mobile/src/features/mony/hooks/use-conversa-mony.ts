import { conversaMony, getConversaMonyQueryKey } from '@mony/api-client';
import type { PaginaConversa } from '@mony/shared/mony';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

/** Mensagens por página do histórico. */
export const TAMANHO_PAGINA_CONVERSA = 30;

/**
 * O histórico da Mony (`GET /mony/conversa`), da mais nova para a mais antiga, página a página. Lê
 * uma vez por abertura da tela: o que se conversa depois fica na tela, e não buscar de novo evita
 * mostrar a mesma mensagem duas vezes.
 */
export function useHistoricoMony() {
  return useInfiniteQuery({
    queryKey: [...getConversaMonyQueryKey(), 'paginas'] as const,
    queryFn: ({ pageParam, signal }): Promise<PaginaConversa> =>
      conversaMony(
        {
          limite: TAMANHO_PAGINA_CONVERSA,
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Busca no texto das mensagens (doc 04), a partir de 2 letras. */
export function useBuscaMony(texto: string) {
  const busca = texto.trim();
  return useQuery({
    queryKey: getConversaMonyQueryKey({ texto: busca }),
    queryFn: ({ signal }): Promise<PaginaConversa> =>
      conversaMony({ texto: busca, limite: TAMANHO_PAGINA_CONVERSA }, { signal }),
    enabled: busca.length >= 2,
  });
}
