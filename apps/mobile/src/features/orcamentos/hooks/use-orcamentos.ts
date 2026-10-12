import {
  definirOrcamentos,
  excluirOrcamentos,
  getListarOrcamentosQueryKey,
  listarOrcamentos,
} from '@mony/api-client';
import type { Competencia } from '@mony/shared/datas';
import type { DadosDefinicaoOrcamento } from '@mony/shared/orcamentos';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';

/** RN-061 e RN-062: os orçamentos do mês com gasto, faixa e projeção, e os totais. */
export function useOrcamentos(competencia: Competencia) {
  return useQuery({
    queryKey: getListarOrcamentosQueryKey({ competencia }),
    queryFn: async ({ signal }) => await listarOrcamentos({ competencia }, { signal }),
  });
}

/**
 * Orçamento mexe no Início, nos alertas e no checklist (o primeiro orçamento conclui a etapa):
 * refaz os dados financeiros e o onboarding.
 */
function useAoMudar() {
  const cliente = useQueryClient();
  return () => {
    void invalidarDadosFinanceiros(cliente);
    void cliente.invalidateQueries({ queryKey: ['/v1/me/onboarding'] });
  };
}

/** RN-060: cria ou muda o orçamento da categoria no mês (`PUT /orcamentos`). */
export function useDefinirOrcamento() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (dados: DadosDefinicaoOrcamento) => definirOrcamentos(dados),
    onSuccess: aoMudar,
  });
}

/** Tira o orçamento do mês; os meses seguintes deixam de recebê-lo. */
export function useExcluirOrcamento() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (id: string) => excluirOrcamentos(id),
    onSuccess: aoMudar,
  });
}
