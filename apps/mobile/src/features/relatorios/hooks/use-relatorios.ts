import {
  anualRelatorios,
  cartoesRelatorios,
  categoriasRelatorios,
  diasDaSemanaRelatorios,
  formasPagamentoRelatorios,
  getAnualRelatoriosQueryKey,
  getCartoesRelatoriosQueryKey,
  getCategoriasRelatoriosQueryKey,
  getDiasDaSemanaRelatoriosQueryKey,
  getFormasPagamentoRelatoriosQueryKey,
  getMensalRelatoriosQueryKey,
  getPrecosRelatoriosQueryKey,
  mensalRelatorios,
  precosRelatorios,
} from '@mony/api-client';
import { TAMANHO_MINIMO_BUSCA_PRECOS } from '@mony/shared/relatorios';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { PeriodoRelatorio } from '../lib/periodos';

/*
 * RN-150: cada relatório é uma rota (`GET /relatorios/:tipo?inicio=&fim=`), e a API faz as
 * contas. Ao trocar de aba, a tela segue com o período anterior até o novo chegar.
 */

export function useRelatorioMensal(periodo: PeriodoRelatorio) {
  return useQuery({
    queryKey: getMensalRelatoriosQueryKey(periodo),
    queryFn: async ({ signal }) => await mensalRelatorios(periodo, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRelatorioAnual(periodo: PeriodoRelatorio, ligado: boolean) {
  return useQuery({
    queryKey: getAnualRelatoriosQueryKey(periodo),
    queryFn: async ({ signal }) => await anualRelatorios(periodo, { signal }),
    enabled: ligado,
  });
}

export function useRelatorioCategorias(periodo: PeriodoRelatorio) {
  const parametros = { ...periodo, tipo: 'despesa' as const };
  return useQuery({
    queryKey: getCategoriasRelatoriosQueryKey(parametros),
    queryFn: async ({ signal }) => await categoriasRelatorios(parametros, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRelatorioDiasDaSemana(periodo: PeriodoRelatorio) {
  return useQuery({
    queryKey: getDiasDaSemanaRelatoriosQueryKey(periodo),
    queryFn: async ({ signal }) => await diasDaSemanaRelatorios(periodo, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRelatorioCartoes(periodo: PeriodoRelatorio) {
  return useQuery({
    queryKey: getCartoesRelatoriosQueryKey(periodo),
    queryFn: async ({ signal }) => await cartoesRelatorios(periodo, { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useRelatorioFormas(periodo: PeriodoRelatorio) {
  return useQuery({
    queryKey: getFormasPagamentoRelatoriosQueryKey(periodo),
    queryFn: async ({ signal }) => await formasPagamentoRelatorios(periodo, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** A busca vale com pelo menos 2 letras (a API recusa menos). */
export function buscaDePrecoValida(busca: string): boolean {
  return busca.trim().length >= TAMANHO_MINIMO_BUSCA_PRECOS;
}

/**
 * Histórico de preços da NFC-e (RN-150, T-066c): `GET /relatorios/precos?busca=`, sem período (a
 * API usa os últimos 12 meses; no gratuito, o mês atual). Enquanto a nova busca não chega, a lista
 * segue com a anterior.
 */
export function useHistoricoPrecos(busca: string) {
  const parametros = { busca: busca.trim() };
  return useQuery({
    queryKey: getPrecosRelatoriosQueryKey(parametros),
    queryFn: async ({ signal }) => await precosRelatorios(parametros, { signal }),
    enabled: buscaDePrecoValida(busca),
    placeholderData: keepPreviousData,
  });
}
