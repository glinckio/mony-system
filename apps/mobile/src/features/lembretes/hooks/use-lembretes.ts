import {
  adiarLembretes,
  atualizarLembretes,
  buscarLembretes,
  concluirLembretes,
  criarLembretes,
  excluirLembretes,
  getBuscarLembretesQueryKey,
  getListarLembretesQueryKey,
  listarLembretes,
} from '@mony/api-client';
import type {
  DadosAtualizacaoLembrete,
  DadosNovoLembrete,
  OpcaoAdiar,
} from '@mony/shared/lembretes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSincronizarAlarmes } from './use-alarmes-locais';

/** Os ativos (os que tocaram primeiro, depois o mais próximo) ou os feitos (RN-075). */
export function useLembretes(status: 'ativo' | 'concluido', ligado = true) {
  return useQuery({
    queryKey: getListarLembretesQueryKey({ status }),
    queryFn: async ({ signal }) => await listarLembretes({ status }, { signal }),
    enabled: ligado,
  });
}

export function useLembrete(id: string) {
  return useQuery({
    queryKey: getBuscarLembretesQueryKey(id),
    queryFn: async ({ signal }) => await buscarLembretes(id, { signal }),
  });
}

/** As consultas geradas começam pela URL: as listas e os lembretes, e o uso do plano (RN-120). */
function ehDeLembretes(chave: readonly unknown[]): boolean {
  const [rota] = chave;
  return (
    typeof rota === 'string' && (rota.startsWith('/v1/lembretes') || rota === '/v1/assinatura/uso')
  );
}

/**
 * Depois de mudar um lembrete: as listas e o detalhe buscam de novo, e a agenda de alarmes do
 * aparelho é trocada pela do servidor (doc 09). `semBuscar` é o excluído (seria 404).
 */
function useAoMudar() {
  const cliente = useQueryClient();
  const sincronizar = useSincronizarAlarmes();
  return (semBuscar?: string) => {
    const excluido = semBuscar === undefined ? null : getBuscarLembretesQueryKey(semBuscar)[0];
    if (excluido !== null) {
      void cliente.invalidateQueries({
        queryKey: getBuscarLembretesQueryKey(semBuscar ?? ''),
        exact: true,
        refetchType: 'none',
      });
    }
    void cliente.invalidateQueries({
      predicate: ({ queryKey }) => ehDeLembretes(queryKey) && queryKey[0] !== excluido,
    });
    void sincronizar();
  };
}

/** `POST /lembretes`, com a `Idempotency-Key` do formulário (repetir não cria dois). */
export function useCriarLembrete() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ dados, chave }: { dados: DadosNovoLembrete; chave: string }) =>
      criarLembretes(dados, { headers: { 'Idempotency-Key': chave } }),
    onSuccess: () => {
      aoMudar();
    },
  });
}

/** Só o que mudou; uma data nova reativa o lembrete feito. */
export function useAtualizarLembrete() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: DadosAtualizacaoLembrete }) =>
      atualizarLembretes(id, dados),
    onSuccess: () => {
      aoMudar();
    },
  });
}

export function useExcluirLembrete() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (id: string) => excluirLembretes(id),
    onSuccess: (_resposta, id) => {
      aoMudar(id);
    },
  });
}

/** RN-076: o [Feito] da ocorrência atual (na repetição, pula para a próxima). */
export function useConcluirLembrete() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (id: string) => concluirLembretes(id, {}),
    onSuccess: () => {
      aoMudar();
    },
  });
}

/** RN-076: adiar por 10 minutos, 1 hora ou para amanhã. */
export function useAdiarLembrete() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, opcao }: { id: string; opcao: OpcaoAdiar }) => adiarLembretes(id, { opcao }),
    onSuccess: () => {
      aoMudar();
    },
  });
}
