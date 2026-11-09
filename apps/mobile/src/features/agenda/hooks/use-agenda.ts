import {
  atualizarCompromissos,
  buscarCompromissos,
  conectarAgendas,
  criarCompromissos,
  definirPadraoAgendas,
  desconectarAgendas,
  excluirCompromissos,
  getBuscarCompromissosQueryKey,
  getListarAgendasQueryKey,
  getPeriodoAgendaQueryKey,
  listarAgendas,
  periodoAgenda,
} from '@mony/api-client';
import type {
  DadosAtualizacaoCompromisso,
  DadosNovoCompromisso,
  ProvedorAgendaExterna,
  ResultadoConexaoAgenda,
} from '@mony/shared/agenda';
import { LINKS_INTERNOS } from '@mony/shared/alertas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { compromissosDoAparelho, type ContaConectada } from '@/lib/agenda-aparelho';
import { esquemaDoApp, linkDoApp } from '@/lib/config';

/** `GET /agenda`: os compromissos que cruzam o período (a semana da tela). */
export function useAgendaDoPeriodo(periodo: { inicio: string; fim: string }) {
  return useQuery({
    queryKey: getPeriodoAgendaQueryKey(periodo),
    queryFn: async ({ signal }) => await periodoAgenda(periodo, { signal }),
  });
}

/**
 * A agenda do aparelho no período (T-085f), lida no próprio aparelho e sem passar pelo servidor. As
 * contas já conectadas no app ficam de fora. Sem a permissão, ou se o aparelho falhar, nenhum: a
 * tela segue com os do servidor.
 */
export function useAgendaDoAparelho(
  periodo: { inicio: string; fim: string },
  conectadas: readonly ContaConectada[],
  fuso: string,
) {
  return useQuery({
    queryKey: [
      'agenda-aparelho',
      periodo.inicio,
      periodo.fim,
      conectadas
        .map(({ provedor, email }) => `${provedor}:${email ?? ''}`)
        .sort()
        .join(','),
      fuso,
    ],
    queryFn: async () => {
      try {
        return await compromissosDoAparelho(periodo, conectadas, fuso);
      } catch {
        return [];
      }
    },
    // Ler o calendário do celular é barato: lê de novo sempre que a tela volta a aparecer ou o app
    // volta para a frente, e o que mudou no app de agenda aparece na hora (T-085n).
    staleTime: 0,
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

/** As consultas geradas começam pela URL: a agenda do período, as agendas e os compromissos. */
function ehDaAgenda(chave: readonly unknown[]): boolean {
  const [rota] = chave;
  return (
    typeof rota === 'string' &&
    (rota === '/v1/agenda' || rota === '/v1/agendas' || rota.startsWith('/v1/compromissos'))
  );
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

/** O resultado que volta no `mony://agenda?conexao=`; outro endereço, ou nenhum, é `null`. */
export function resultadoDaConexao(url: string | null | undefined): ResultadoConexaoAgenda | null {
  const valor = /[?&]conexao=(sucesso|cancelado|erro|sem-permissao)(?:&|$)/.exec(url ?? '')?.[1];
  return (valor as ResultadoConexaoAgenda | undefined) ?? null;
}

/**
 * Conectar (ou reconectar) o Google ou o Outlook (T-085e, doc 10): `POST /agendas/conectar` dá o
 * consentimento no provedor, que abre no navegador do app; o servidor grava a conexão e volta em
 * `mony://agenda?conexao=`. Fechar o navegador sem voltar conta como cancelado.
 */
export function useConectarAgenda() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: async (provedor: ProvedorAgendaExterna): Promise<ResultadoConexaoAgenda> => {
      // T-085m: o servidor volta no esquema deste build (o de desenvolvimento é `mony-dev`).
      const { url } = await conectarAgendas({ provedor, esquema: esquemaDoApp() });
      const resultado = await WebBrowser.openAuthSessionAsync(
        url,
        linkDoApp(LINKS_INTERNOS.agenda()),
      );
      return resultado.type === 'success'
        ? (resultadoDaConexao(resultado.url) ?? 'erro')
        : 'cancelado';
    },
    onSettled: () => {
      aoMudar();
    },
  });
}

/** RN-079: onde os compromissos novos vão; `null` deixa só no Monitorizze. */
export function useDefinirAgendaPadrao() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (agendaId: string | null) => definirPadraoAgendas({ agendaId }),
    onSuccess: () => {
      aoMudar();
    },
  });
}

/** Revoga no provedor; os compromissos de lá saem, os do app e da Mony ficam no Monitorizze. */
export function useDesconectarAgenda() {
  const aoMudar = useAoMudar();
  return useMutation({
    mutationFn: (agendaId: string) => desconectarAgendas(agendaId),
    onSuccess: () => {
      aoMudar();
    },
  });
}
