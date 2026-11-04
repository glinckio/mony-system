import {
  atualizarAppsMonitorados,
  emitirTokenAppsMonitorados,
  getListarAppsMonitoradosQueryKey,
  getListarConsentimentosQueryKey,
  listarAppsMonitorados,
  revogarTokenAppsMonitorados,
} from '@mony/api-client';
import type {
  DadosAtualizacaoAppsMonitorados,
  ListaAppsMonitorados,
} from '@mony/shared/apps-compra';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { configApp } from '@/lib/config';
import { type ModuloUsoDeApps, pacotesAtivos } from '@/lib/uso-de-apps';

/** O estado guardado no aparelho, que muda fora do JS (o worker e as configurações do sistema). */
const CHAVE_APARELHO = ['uso-de-apps', 'aparelho'] as const;
const CHAVE_INSTALADOS = ['uso-de-apps', 'instalados'] as const;

/** A lista do servidor (`GET /apps-monitorados`), com `disponivel` (RN-121). */
export function useAppsMonitorados() {
  return useQuery({
    queryKey: getListarAppsMonitoradosQueryKey(),
    queryFn: ({ signal }) => listarAppsMonitorados({ signal }) as Promise<ListaAppsMonitorados>,
  });
}

/** O acesso ao uso e o estado do envio neste aparelho. */
export function useAparelho(modulo: ModuloUsoDeApps) {
  return useQuery({
    queryKey: CHAVE_APARELHO,
    queryFn: async () => {
      const [acessoAoUso, estado] = await Promise.all([
        modulo.acessoAoUsoLiberado(),
        modulo.estado(),
      ]);
      return { acessoAoUso, ...estado };
    },
  });
}

/** Os apps que abrem pela tela inicial. Mudam pouco: lidos uma vez por abertura da tela. */
export function useAppsInstalados(modulo: ModuloUsoDeApps) {
  return useQuery({
    queryKey: CHAVE_INSTALADOS,
    queryFn: () => modulo.listarApps(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Liga o recurso: o servidor emite o token de evento (e grava o consentimento `apps_compra`; no
 * gratuito, 403 `RECURSO_EXIGE_PLANO_PAGO`) e o aparelho o guarda cifrado e começa a verificar.
 */
export function useLigarAppsDeCompra(modulo: ModuloUsoDeApps) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (lista: ListaAppsMonitorados) => {
      const { token } = await emitirTokenAppsMonitorados();
      await modulo.ligar(token, configApp.urlApi, pacotesAtivos(lista.itens));
    },
    onSettled: () =>
      Promise.all([
        cliente.invalidateQueries({ queryKey: CHAVE_APARELHO }),
        cliente.invalidateQueries({ queryKey: getListarConsentimentosQueryKey() }),
      ]),
  });
}

/**
 * Desliga neste aparelho: primeiro o aparelho para (mesmo sem rede, nada mais sai daqui), depois o
 * servidor esquece o token. Se o servidor não responder, o token fica lá até sair ou trocar de
 * plano, mas sem ninguém para usá-lo.
 */
export function useDesligarAppsDeCompra(modulo: ModuloUsoDeApps) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await modulo.desligar();
      await revogarTokenAppsMonitorados().catch(() => undefined);
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: CHAVE_APARELHO }),
  });
}

/** Troca a lista no servidor e, ligado, os apps que o aparelho verifica. */
export function useSalvarAppsMonitorados(modulo: ModuloUsoDeApps) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (dados: DadosAtualizacaoAppsMonitorados) => {
      const lista = await atualizarAppsMonitorados(dados);
      await modulo.trocarApps(pacotesAtivos(lista.itens));
      return lista;
    },
    onSuccess: (lista) => {
      cliente.setQueryData(getListarAppsMonitoradosQueryKey(), lista);
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: CHAVE_APARELHO }),
  });
}

/** Relê o estado do aparelho (ao voltar das configurações do sistema, por exemplo). */
export function useRelerAparelho() {
  const cliente = useQueryClient();
  return () => cliente.invalidateQueries({ queryKey: CHAVE_APARELHO });
}
