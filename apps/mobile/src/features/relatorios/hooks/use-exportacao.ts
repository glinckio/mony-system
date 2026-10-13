import { ErroApi, exportarRelatorios, useExportacaoRelatorios } from '@mony/api-client';
import type { FormatoExportacao } from '@mony/shared/enums';
import type { Exportacao } from '@mony/shared/relatorios';
import { useMutation } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';

import type { PeriodoRelatorio } from '../lib/periodos';

/** De quanto em quanto tempo o app pergunta se o arquivo ficou pronto. */
export const INTERVALO_EXPORTACAO_MS = 1_500;

/**
 * Exportação do relatório (RN-151, T-125): pede o arquivo (`POST /relatorios/exportar`) e pergunta
 * de tempos em tempos (`GET /relatorios/exportacoes/:id`) até ele ficar pronto, com a URL de 24 h.
 * `limite` diz que o plano gratuito não exporta (RN-120), para a tela mostrar [Ver planos].
 */
export function useExportacao() {
  const [atual, definirAtual] = useState<Exportacao | null>(null);
  const pedido = useMutation({
    mutationFn: (dados: { formato: FormatoExportacao; periodo: PeriodoRelatorio }) =>
      exportarRelatorios(
        { formato: dados.formato, ...dados.periodo },
        { headers: { 'Idempotency-Key': randomUUID() } },
      ),
    onSuccess: (exportacao) => {
      definirAtual(exportacao);
    },
  });
  const consulta = useExportacaoRelatorios(atual?.id ?? '', {
    query: {
      enabled: atual?.status === 'processando',
      refetchInterval: (estado) =>
        estado.state.data?.status === 'processando' ? INTERVALO_EXPORTACAO_MS : false,
    },
  });
  const exportacao = consulta.data ?? atual;
  const erro = pedido.error;
  return {
    exportacao,
    pedir: (formato: FormatoExportacao, periodo: PeriodoRelatorio) => {
      definirAtual(null);
      pedido.mutate({ formato, periodo });
    },
    pedindo: pedido.isPending,
    erro,
    limite: erro instanceof ErroApi && erro.codigo === 'LIMITE_PLANO_ATINGIDO',
    recomecar: () => {
      definirAtual(null);
      pedido.reset();
    },
  };
}
