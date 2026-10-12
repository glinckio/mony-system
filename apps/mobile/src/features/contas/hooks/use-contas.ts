import { atualizarContas, criarContas, excluirContas, useListarContas } from '@mony/api-client';
import type { DadosAtualizacaoConta, DadosNovaConta } from '@mony/shared/contas';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';

/** Contas e carteiras (`GET /contas`), com o saldo atual calculado pela API. */
export function useContas() {
  return useListarContas();
}

/** Conta nova, mudada ou excluída muda saldos, nomes nas listas e o Início. */
function useAoMudar() {
  const cliente = useQueryClient();
  return () => {
    void invalidarDadosFinanceiros(cliente);
  };
}

export function useCriarConta() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (dados: DadosNovaConta) => criarContas(dados),
    onSuccess: aoMudar,
  });
}

export function useAtualizarConta() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: DadosAtualizacaoConta }) =>
      atualizarContas(id, dados),
    onSuccess: aoMudar,
  });
}

/** Lançamentos, recorrências e cartões que usavam a conta ficam sem conta (doc 05). */
export function useExcluirConta() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (id: string) => excluirContas(id),
    onSuccess: aoMudar,
  });
}
