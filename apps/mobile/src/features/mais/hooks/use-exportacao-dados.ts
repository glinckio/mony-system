import {
  exportarLgpd,
  getUltimaExportacaoLgpdQueryKey,
  useUltimaExportacaoLgpd,
} from '@mony/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';

/** De quanto em quanto tempo o app pergunta se o arquivo ficou pronto. */
export const INTERVALO_EXPORTACAO_DADOS_MS = 3_000;

/**
 * Exportar meus dados (RN-160, T-140a): a última exportação (`GET /me/exportar`), perguntada de
 * tempos em tempos enquanto o worker gera, e o pedido de uma nova (`POST /me/exportar`).
 */
export function useExportacaoDados(ativo: boolean) {
  const cliente = useQueryClient();
  const consulta = useUltimaExportacaoLgpd({
    query: {
      enabled: ativo,
      refetchInterval: (estado) =>
        estado.state.data?.exportacao?.status === 'processando'
          ? INTERVALO_EXPORTACAO_DADOS_MS
          : false,
    },
  });
  const pedido = useMutation({
    mutationFn: () => exportarLgpd({ headers: { 'Idempotency-Key': randomUUID() } }),
    onSuccess: (exportacao) => {
      cliente.setQueryData(getUltimaExportacaoLgpdQueryKey(), { exportacao });
    },
  });
  return {
    exportacao: consulta.data?.exportacao ?? null,
    carregando: consulta.isPending,
    pedir: () => {
      pedido.mutate();
    },
    pedindo: pedido.isPending,
    erro: pedido.error ?? consulta.error,
  };
}
