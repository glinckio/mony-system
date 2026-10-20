import {
  atualizarCompromissos,
  buscarCompromissos,
  criarCompromissos,
  excluirCompromissos,
  getBuscarCompromissosQueryKey,
  getListarAgendasQueryKey,
  getPeriodoAgendaQueryKey,
  listarAgendas,
  periodoAgenda,
} from '@mony/api-client';
import type { DadosAtualizacaoCompromisso, DadosNovoCompromisso } from '@mony/shared/agenda';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** `GET /agenda`: os compromissos que cruzam o período (a semana da tela). */
export function useAgendaDoPeriodo(periodo: { inicio: string; fim: string }) {
  return useQuery({
    queryKey: getPeriodoAgendaQueryKey(periodo),
    queryFn: async ({ signal }) => await periodoAgenda(periodo, { signal }),
  });
}

/** As agendas conectadas: qual é a padrão, para dizer onde o novo vai (RN-079). */
export function useAgendas() {
  return useQuery({
    queryKey: getListarAgendasQueryKey(),
    queryFn: async ({ signal }) => await listarAgendas({ signal }),
    staleTime: 60_000,
  });
}

export function useCompromisso(id: string) {
  return useQuery({
    queryKey: getBuscarCompromissosQueryKey(id),
    queryFn: async ({ signal }) => await buscarCompromissos(id, { signal }),
  });
}

/** As consultas geradas começam pela URL: a agenda do período e os compromissos. */
function ehDaAgenda(chave: readonly unknown[]): boolean {
  const [rota] = chave;
  return typeof rota === 'string' && (rota === '/v1/agenda' || rota.startsWith('/v1/compromissos'));
}

/** Depois de mudar: a semana e o detalhe buscam de novo. `semBuscar` é o excluído (seria 404). */
function useAoMudar() {
  const cliente = useQueryClient();
  return (semBuscar?: string) => {
    const excluido = semBuscar === undefined ? null : getBuscarCompromissosQueryKey(semBuscar)[0];
    void cliente.invalidateQueries({
      predicate: ({ queryKey }) => ehDaAgenda(queryKey) && queryKey[0] !== excluido,
    });
  };
}

/** `POST /compromissos`, com a `Idempotency-Key` do formulário (repetir não cria dois). */
export function useCriarCompromisso() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ dados, chave }: { dados: DadosNovoCompromisso; chave: string }) =>
      criarCompromissos(dados, { headers: { 'Idempotency-Key': chave } }),
    onSuccess: () => {
      aoMudar();
    },
  });
}

/** Só o que mudou; só os do app e da Mony (RN-079). */
export function useAtualizarCompromisso() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: DadosAtualizacaoCompromisso }) =>
      atualizarCompromissos(id, dados),
    onSuccess: () => {
      aoMudar();
    },
  });
}

export function useExcluirCompromisso() {
  const aoMudar = useAoMudar();
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => excluirCompromissos(id),
    onSuccess: (_resposta, id) => {
      cliente.removeQueries({ queryKey: getBuscarCompromissosQueryKey(id), exact: true });
      aoMudar(id);
    },
  });
}
