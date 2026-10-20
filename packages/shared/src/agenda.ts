/**
 * Agenda (T-085a, RN-079): contrato das rotas de agendas conectadas e compromissos.
 *
 * Os compromissos externos (vindos da agenda do Google ou do Outlook) são só para leitura; os
 * criados no app ou pela Mony vão para a agenda padrão e podem ser editados.
 */
import { z } from 'zod';

import { ORIGENS_COMPROMISSO, PROVEDORES_AGENDA } from './enums.js';

/** As agendas que conectam pelo servidor (OAuth); a do aparelho fica no app (T-085c). */
export const PROVEDORES_AGENDA_EXTERNA = ['google', 'outlook'] as const;
export type ProvedorAgendaExterna = (typeof PROVEDORES_AGENDA_EXTERNA)[number];

export const TAMANHO_MAXIMO_TITULO_COMPROMISSO = 200;
export const TAMANHO_MAXIMO_LOCAL_COMPROMISSO = 200;
/** `GET /agenda`: no máximo 93 dias por consulta (um trimestre com folga). */
export const PERIODO_MAXIMO_AGENDA_DIAS = 93;

/** Como volta o consentimento no provedor: o app lê em `mony://agenda?conexao=`. */
export const RESULTADOS_CONEXAO_AGENDA = ['sucesso', 'cancelado', 'erro'] as const;
export type ResultadoConexaoAgenda = (typeof RESULTADOS_CONEXAO_AGENDA)[number];

const esquemaInstante = z.iso.datetime({ offset: true });

/** `POST /agendas/conectar`. */
export const esquemaPedidoConexaoAgenda = z.object({
  provedor: z.enum(PROVEDORES_AGENDA_EXTERNA),
});

/** O endereço do consentimento no provedor, para o app abrir no navegador. */
export const esquemaLinkConexaoAgenda = z.object({ url: z.url() });

export const esquemaAgendaConectada = z.object({
  id: z.uuid(),
  provedor: z.enum(PROVEDORES_AGENDA),
  /** Onde o app e a Mony criam compromissos (RN-079). */
  padrao: z.boolean(),
  /** `reconectar`: o provedor recusou o acesso (revogado lá); conectar de novo resolve. */
  situacao: z.enum(['conectada', 'reconectar']),
  sincronizadaEm: z.iso.datetime().nullable(),
  conectadaEm: z.iso.datetime(),
});

export const esquemaListaAgendas = z.object({ itens: z.array(esquemaAgendaConectada) });

/** `PUT /agendas/padrao`: `null` deixa os compromissos novos só no Mony. */
export const esquemaAgendaPadrao = z.object({ agendaId: z.uuid().nullable() });

export const esquemaCompromisso = z.object({
  id: z.uuid(),
  titulo: z.string(),
  inicio: z.iso.datetime(),
  fim: z.iso.datetime().nullable(),
  local: z.string().nullable(),
  origem: z.enum(ORIGENS_COMPROMISSO),
  /** RN-079: só os criados no app ou pela Mony. */
  editavel: z.boolean(),
  /** Em qual agenda conectada está; `null` quando fica só no Mony. */
  agenda: z.object({ id: z.uuid(), provedor: z.enum(PROVEDORES_AGENDA) }).nullable(),
  criadoEm: z.iso.datetime(),
  atualizadoEm: z.iso.datetime(),
});

/** `GET /agenda?inicio=&fim=`: os compromissos que cruzam o período, do mais cedo ao mais tarde. */
export const esquemaConsultaAgenda = z
  .object({ inicio: esquemaInstante, fim: esquemaInstante })
  .refine(({ inicio, fim }) => new Date(fim) > new Date(inicio), {
    message: 'O fim vem depois do início.',
    path: ['fim'],
  })
  .refine(
    ({ inicio, fim }) =>
      new Date(fim).getTime() - new Date(inicio).getTime() <=
      PERIODO_MAXIMO_AGENDA_DIAS * 86_400_000,
    { message: `No máximo ${String(PERIODO_MAXIMO_AGENDA_DIAS)} dias.`, path: ['fim'] },
  );

export const esquemaAgendaDoPeriodo = z.object({ itens: z.array(esquemaCompromisso) });

const esquemaTitulo = z.string().trim().min(1).max(TAMANHO_MAXIMO_TITULO_COMPROMISSO);
const esquemaLocal = z.string().trim().max(TAMANHO_MAXIMO_LOCAL_COMPROMISSO);

const fimDepoisDoInicio = (dados: { inicio?: string; fim?: string | null }): boolean =>
  dados.inicio === undefined ||
  dados.fim === undefined ||
  dados.fim === null ||
  new Date(dados.fim) > new Date(dados.inicio);

/** `POST /compromissos`: vai para a agenda padrão (RN-079). */
export const esquemaNovoCompromisso = z
  .object({
    titulo: esquemaTitulo,
    inicio: esquemaInstante,
    fim: esquemaInstante.nullable().optional(),
    local: esquemaLocal.nullable().optional(),
  })
  .refine(fimDepoisDoInicio, { message: 'O fim vem depois do início.', path: ['fim'] });

/** `PATCH /compromissos/:id`: só o que muda; só os editáveis (RN-079). */
export const esquemaAtualizacaoCompromisso = z
  .object({
    titulo: esquemaTitulo,
    inicio: esquemaInstante,
    fim: esquemaInstante.nullable(),
    local: esquemaLocal.nullable(),
  })
  .partial()
  .refine((dados) => Object.keys(dados).length > 0, { message: 'Informe o que muda.' })
  .refine(fimDepoisDoInicio, { message: 'O fim vem depois do início.', path: ['fim'] });

export type DadosPedidoConexaoAgenda = z.infer<typeof esquemaPedidoConexaoAgenda>;
export type LinkConexaoAgenda = z.infer<typeof esquemaLinkConexaoAgenda>;
export type AgendaConectada = z.infer<typeof esquemaAgendaConectada>;
export type ListaAgendas = z.infer<typeof esquemaListaAgendas>;
export type DadosAgendaPadrao = z.infer<typeof esquemaAgendaPadrao>;
export type Compromisso = z.infer<typeof esquemaCompromisso>;
export type ConsultaAgenda = z.infer<typeof esquemaConsultaAgenda>;
export type AgendaDoPeriodo = z.infer<typeof esquemaAgendaDoPeriodo>;
export type DadosNovoCompromisso = z.infer<typeof esquemaNovoCompromisso>;
export type DadosAtualizacaoCompromisso = z.infer<typeof esquemaAtualizacaoCompromisso>;
