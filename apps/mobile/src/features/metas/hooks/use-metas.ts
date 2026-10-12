import {
  aportarMetas,
  atualizarMetas,
  buscarMetas,
  criarMetas,
  excluirAporteMetas,
  excluirMetas,
  getBuscarMetasQueryKey,
  getListarMetasQueryKey,
  listarMetas,
} from '@mony/api-client';
import type { DadosAtualizacaoMeta, DadosNovaMeta, DadosNovoAporte } from '@mony/shared/metas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Metas abertas primeiro, pelo prazo (RN-063). */
export function useMetas() {
  return useQuery({
    queryKey: getListarMetasQueryKey(),
    queryFn: async ({ signal }) => await listarMetas({ signal }),
  });
}

/** A meta e os aportes, do mais novo para o mais antigo. */
export function useMeta(id: string) {
  return useQuery({
    queryKey: getBuscarMetasQueryKey(id),
    queryFn: async ({ signal }) => await buscarMetas(id, { signal }),
  });
}

/** A chave das consultas geradas começa pela URL: a lista e o detalhe de cada meta, e o Início. */
function ehDeMetas(chave: readonly unknown[]): boolean {
  const [rota] = chave;
  return typeof rota === 'string' && (rota.startsWith('/v1/metas') || rota === '/v1/dashboard');
}

/** Metas não dependem de lançamentos: mudar uma refaz só as consultas de metas e o Início. */
function useAoMudar() {
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ predicate: ({ queryKey }) => ehDeMetas(queryKey) });
  };
}

export function useCriarMeta() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (dados: DadosNovaMeta) => criarMetas(dados),
    onSuccess: aoMudar,
  });
}

/** Só o que mudou; `concluida` marca ou reabre a meta (RN-063). */
export function useAtualizarMeta() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: DadosAtualizacaoMeta }) =>
      atualizarMetas(id, dados),
    onSuccess: aoMudar,
  });
}

export function useExcluirMeta() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => excluirMetas(id),
    onSuccess: (_resposta, id) => {
      // O detalhe da meta excluída fica velho sem ser buscado (seria 404 na tela que fecha).
      void cliente.invalidateQueries({
        queryKey: getBuscarMetasQueryKey(id),
        exact: true,
        refetchType: 'none',
      });
      const excluida = getBuscarMetasQueryKey(id)[0];
      void cliente.invalidateQueries({
        predicate: ({ queryKey }) => ehDeMetas(queryKey) && queryKey[0] !== excluida,
      });
    },
  });
}

/**
 * Aporte já feito (sem data, hoje), com a `Idempotency-Key` da folha aberta. A resposta diz se a
 * meta chegou ao alvo e ainda não foi concluída (`sugerirConclusao`, RN-063).
 */
export function useAportar() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados, chave }: { id: string; dados: DadosNovoAporte; chave: string }) =>
      aportarMetas(id, dados, { headers: { 'Idempotency-Key': chave } }),
    onSuccess: aoMudar,
  });
}

export function useExcluirAporte() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, aporteId }: { id: string; aporteId: string }) =>
      excluirAporteMetas(id, aporteId),
    onSuccess: aoMudar,
  });
}
