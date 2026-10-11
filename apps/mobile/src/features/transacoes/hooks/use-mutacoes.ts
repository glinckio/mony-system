import {
  atualizarTransacoes,
  excluirTransacoes,
  getBuscarTransacoesQueryKey,
  loteTransacoes,
  registrarTransacoes,
} from '@mony/api-client';
import type { EscopoExclusaoOcorrencia } from '@mony/shared/recorrencias';
import type {
  DadosAtualizacaoTransacao,
  DadosLoteTransacoes,
  DadosNovaTransacao,
} from '@mony/shared/transacoes';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';

/**
 * Toda mutação de lançamento refaz a lista, os totais, o Início, cartões e orçamentos. Sem esperar:
 * a tela volta para a lista na hora, e a lista se atualiza quando a API responder.
 */
function useAoMudar() {
  const cliente = useQueryClient();
  return (semBuscar?: readonly unknown[]) => {
    void invalidarDadosFinanceiros(cliente, semBuscar);
  };
}

/**
 * `POST /transacoes`. A `Idempotency-Key` é a mesma em todas as tentativas do mesmo formulário:
 * repetir depois de uma falha de rede não duplica o lançamento (doc 04).
 */
export function useRegistrarTransacao() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ dados, chave }: { dados: DadosNovaTransacao; chave: string }) =>
      registrarTransacoes(dados, { headers: { 'Idempotency-Key': chave } }),
    onSuccess: () => {
      aoMudar();
    },
  });
}

/** `PATCH /transacoes/:id`, só com o que mudou. */
export function useAtualizarTransacao() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: DadosAtualizacaoTransacao }) =>
      atualizarTransacoes(id, dados),
    onSuccess: () => {
      aoMudar();
    },
  });
}

/** `DELETE /transacoes/:id` (RN-046); na ocorrência de recorrência, com o escopo da RN-043. */
export function useExcluirTransacao() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, escopo }: { id: string; escopo?: EscopoExclusaoOcorrencia }) =>
      excluirTransacoes(id, escopo === undefined ? undefined : { recorrencia: escopo }),
    onSuccess: (_resposta, { id }) => {
      aoMudar(getBuscarTransacoesQueryKey(id));
    },
  });
}

/** `POST /transacoes/lote`: excluir ou mudar a categoria de vários, tudo ou nada (RN-044). */
export function useLoteTransacoes() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (dados: DadosLoteTransacoes) => loteTransacoes(dados),
    onSuccess: () => {
      aoMudar();
    },
  });
}
