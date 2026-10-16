import {
  atualizarPreferenciasAlerta,
  getListarNotificacoesQueryKey,
  getListarNovidadesQueryKey,
  getObterDashboardQueryKey,
  getObterPreferenciasAlertaQueryKey,
  listarNotificacoes,
  listarNovidades,
  marcarLidaNotificacoes,
  marcarLidaNovidades,
  marcarTodasNotificacoes,
  obterPreferenciasAlerta,
} from '@mony/api-client';
import type {
  DadosAtualizacaoPreferenciasAlerta,
  Novidades,
  PaginaNotificacoes,
  PreferenciasAlerta,
} from '@mony/shared/notificacoes';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const TAMANHO_PAGINA = 30;

/** A central (`GET /notificacoes`), da mais nova para a mais antiga; `naoLidas` filtra. */
export function useNotificacoes(naoLidas: boolean) {
  return useInfiniteQuery({
    queryKey: [
      ...getListarNotificacoesQueryKey(naoLidas ? { naoLidas: 'true' } : {}),
      'paginas',
    ] as const,
    queryFn: ({ pageParam, signal }): Promise<PaginaNotificacoes> =>
      listarNotificacoes(
        {
          limite: TAMANHO_PAGINA,
          ...(naoLidas ? { naoLidas: 'true' } : {}),
          ...(pageParam === null ? {} : { cursor: pageParam }),
        },
        { signal },
      ) as Promise<PaginaNotificacoes>,
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.proximoCursor,
  });
}

/** Depois de ler: a central e o ponto do sino no Início. */
function useAtualizarLidas() {
  const cliente = useQueryClient();
  return async () => {
    await Promise.all([
      cliente.invalidateQueries({ queryKey: getListarNotificacoesQueryKey() }),
      cliente.invalidateQueries({ queryKey: getObterDashboardQueryKey() }),
    ]);
  };
}

export function useMarcarLida() {
  const atualizar = useAtualizarLidas();
  return useMutation({
    mutationFn: (id: string) => marcarLidaNotificacoes(id),
    onSuccess: atualizar,
  });
}

export function useMarcarTodas() {
  const atualizar = useAtualizarLidas();
  return useMutation({
    mutationFn: () => marcarTodasNotificacoes(),
    onSuccess: atualizar,
  });
}

/** A aba Novidades (`GET /novidades`, T-150): as no ar, da mais nova para a mais antiga. */
export function useNovidades() {
  return useQuery({
    queryKey: getListarNovidadesQueryKey(),
    queryFn: ({ signal }) => listarNovidades({ signal }) as Promise<Novidades>,
  });
}

/** Marca as novidades como lidas, uma a uma, e depois atualiza a aba e o sino do Início. */
export function useLerNovidades() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (ids: readonly string[]) => {
      for (const id of ids) await marcarLidaNovidades(id);
    },
    onSettled: async () => {
      await Promise.all([
        cliente.invalidateQueries({ queryKey: getListarNovidadesQueryKey() }),
        cliente.invalidateQueries({ queryKey: getObterDashboardQueryKey() }),
      ]);
    },
  });
}

/** `GET /preferencias-alerta`: o silêncio e os tipos (RN-100, RN-101, RN-108). */
export function usePreferenciasAlerta() {
  return useQuery({
    queryKey: getObterPreferenciasAlertaQueryKey(),
    queryFn: ({ signal }) => obterPreferenciasAlerta({ signal }) as Promise<PreferenciasAlerta>,
  });
}

export function useSalvarPreferenciasAlerta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (dados: DadosAtualizacaoPreferenciasAlerta) =>
      atualizarPreferenciasAlerta(dados) as Promise<PreferenciasAlerta>,
    onSuccess: (preferencias) => {
      cliente.setQueryData(getObterPreferenciasAlertaQueryKey(), preferencias);
    },
  });
}
