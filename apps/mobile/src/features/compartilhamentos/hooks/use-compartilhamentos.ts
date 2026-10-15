import {
  aceitarCompartilhamentos,
  atualizarCompartilhamentos,
  convidarCompartilhamentos,
  excluirCompartilhamentos,
  getListarCompartilhamentosQueryKey,
  listarCompartilhamentos,
  recusarCompartilhamentos,
} from '@mony/api-client';
import type { DadosNovoCompartilhamento } from '@mony/shared/compartilhamentos';
import type { PermissaoCompartilhamento } from '@mony/shared/enums';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Os convites recebidos (pendentes e aceitos) e os enviados (RN-074). */
export function useCompartilhamentos() {
  return useQuery({
    queryKey: getListarCompartilhamentosQueryKey(),
    queryFn: async ({ signal }) => await listarCompartilhamentos({ signal }),
  });
}

/**
 * Um convite muda os convites, as listas e os lembretes de quem vê (o acesso, o dono e "compartilhada
 * com"). As consultas geradas começam pela URL.
 */
function invalidarCompartilhados(cliente: QueryClient) {
  return cliente.invalidateQueries({
    predicate: ({ queryKey }) => {
      const [rota] = queryKey;
      return (
        typeof rota === 'string' &&
        (rota === getListarCompartilhamentosQueryKey()[0] ||
          rota.startsWith('/v1/listas') ||
          rota.startsWith('/v1/lembretes'))
      );
    },
  });
}

/** O dono convida pelo e-mail ou pelo celular de quem tem conta. */
export function useConvidar() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async (dados: DadosNovoCompartilhamento) => await convidarCompartilhamentos(dados),
    onSuccess: () => invalidarCompartilhados(cliente),
  });
}

/** Quem recebeu aceita ou recusa o convite. */
export function useResponderConvite() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, aceitar }: { id: string; aceitar: boolean }) =>
      aceitar ? await aceitarCompartilhamentos(id) : await recusarCompartilhamentos(id),
    onSuccess: () => invalidarCompartilhados(cliente),
  });
}

/** O dono muda a permissão de quem convidou. */
export function useMudarPermissao() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, permissao }: { id: string; permissao: PermissaoCompartilhamento }) =>
      await atualizarCompartilhamentos(id, { permissao }),
    onSuccess: () => invalidarCompartilhados(cliente),
  });
}

/** O dono tira a pessoa, ou a pessoa sai da lista ou do lembrete. */
export function useTirarCompartilhamento() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => excluirCompartilhamentos(id),
    onSuccess: () => invalidarCompartilhados(cliente),
  });
}
