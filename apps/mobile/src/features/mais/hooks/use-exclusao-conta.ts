import {
  desistirDaExclusaoLgpd,
  getExclusaoAgendadaLgpdQueryKey,
  pedirCodigoExclusaoLgpd,
  pedirExclusaoLgpd,
  useExclusaoAgendadaLgpd,
} from '@mony/api-client';
import type { DadosPedidoExclusaoConta } from '@mony/shared/usuario';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { encerrarSessaoLocal } from '@/lib/auth/sessao';

/**
 * Excluir a conta (RN-161, T-140b): a exclusão agendada (`GET /me/exclusao`), o código por e-mail
 * para quem não tem senha, o pedido e a desistência dentro dos 7 dias. O pedido encerra as sessões
 * de todos os aparelhos na API: depois de mostrar a data, o app sai da conta (`sairDaConta`).
 */
export function useExclusaoConta() {
  const cliente = useQueryClient();
  const consulta = useExclusaoAgendadaLgpd();
  const codigo = useMutation({ mutationFn: () => pedirCodigoExclusaoLgpd() });
  const pedido = useMutation({
    mutationFn: (dados: DadosPedidoExclusaoConta) => pedirExclusaoLgpd(dados),
  });
  const desistencia = useMutation({
    mutationFn: () => desistirDaExclusaoLgpd(),
    onSuccess: (exclusao) => {
      cliente.setQueryData(getExclusaoAgendadaLgpdQueryKey(), exclusao);
    },
  });
  return {
    agendadaPara: consulta.data?.agendadaPara ?? null,
    pedirCodigo: () => {
      codigo.mutate();
    },
    codigoEnviado: codigo.isSuccess,
    pedindoCodigo: codigo.isPending,
    excluir: (dados: DadosPedidoExclusaoConta) => {
      pedido.mutate(dados);
    },
    excluindo: pedido.isPending,
    /** A data da exclusão que acabou de ser pedida; a sessão já não vale mais. */
    pedidaPara: pedido.data?.agendadaPara ?? null,
    sairDaConta: () => {
      void encerrarSessaoLocal();
    },
    desistir: () => {
      desistencia.mutate();
    },
    desistindo: desistencia.isPending,
    erro: pedido.error ?? codigo.error ?? desistencia.error,
  };
}
