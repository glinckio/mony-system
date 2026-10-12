import {
  atualizarCartoes,
  buscarFaturas,
  criarCartoes,
  excluirCartoes,
  faturasCartoes,
  getBuscarFaturasQueryKey,
  getFaturasCartoesQueryKey,
  getListarCartoesQueryKey,
  listarCartoes,
  pagarFaturas,
} from '@mony/api-client';
import type {
  DadosAtualizacaoCartao,
  DadosNovoCartao,
  DadosPagamentoFatura,
} from '@mony/shared/cartoes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';

/** Cartões com limite usado, disponível, percentual e a fatura atual (RN-034). */
export function useCartoes() {
  return useQuery({
    queryKey: getListarCartoesQueryKey(),
    queryFn: async ({ signal }) => await listarCartoes({ signal }),
  });
}

/** Faturas do cartão, da mais nova para a mais antiga (inclusive as futuras, com parcelas). */
export function useFaturasDoCartao(cartaoId: string | undefined) {
  return useQuery({
    queryKey: getFaturasCartoesQueryKey(cartaoId ?? ''),
    queryFn: async ({ signal }) => await faturasCartoes(cartaoId ?? '', { signal }),
    enabled: cartaoId !== undefined,
  });
}

/** A fatura com as compras e os pagamentos. */
export function useFatura(faturaId: string) {
  return useQuery({
    queryKey: getBuscarFaturasQueryKey(faturaId),
    queryFn: async ({ signal }) => await buscarFaturas(faturaId, { signal }),
  });
}

function useAoMudar() {
  const cliente = useQueryClient();
  return () => {
    void invalidarDadosFinanceiros(cliente);
  };
}

export function useCriarCartao() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (dados: DadosNovoCartao) => criarCartoes(dados),
    onSuccess: aoMudar,
  });
}

export function useAtualizarCartao() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: DadosAtualizacaoCartao }) =>
      atualizarCartoes(id, dados),
    onSuccess: aoMudar,
  });
}

/** Com saldo em aberto em alguma fatura, a API recusa (409 `CONFLITO`). */
export function useExcluirCartao() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (id: string) => excluirCartoes(id),
    onSuccess: aoMudar,
  });
}

/**
 * RN-036: pagamento total ou parcial, com a `Idempotency-Key` da folha aberta (repetir depois de
 * uma falha de rede não paga duas vezes).
 */
export function usePagarFatura() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({
      faturaId,
      dados,
      chave,
    }: {
      faturaId: string;
      dados: DadosPagamentoFatura;
      chave: string;
    }) => pagarFaturas(faturaId, dados, { headers: { 'Idempotency-Key': chave } }),
    onSuccess: aoMudar,
  });
}
