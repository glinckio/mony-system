/**
 * Tempo real das listas compartilhadas (RN-074, T-124b): Socket.IO em `/v1/ws`, só pelo transporte
 * WebSocket. O app conecta com o token de acesso em `auth.token`, entra na sala da lista que está
 * aberta e, a cada `lista:mudou`, busca a lista de novo pela API: o aviso não leva os dados, porque
 * o detalhe da lista muda conforme quem vê (acesso, histórico de preço, orçamento).
 */
import { z } from 'zod';

import type { CodigoErro } from './erros.js';

/** Caminho do Socket.IO (opção `path` do cliente), fora do prefixo HTTP. */
export const CAMINHO_WS = '/v1/ws';

export const EVENTOS_TEMPO_REAL = {
  /** Cliente → servidor, com ack: entra na sala da lista. */
  entrarLista: 'lista:entrar',
  /** Cliente → servidor, com ack: sai da sala da lista. */
  sairLista: 'lista:sair',
  /** Servidor → cliente: a lista mudou; busque de novo. */
  listaMudou: 'lista:mudou',
} as const;

/**
 * O que mudou: os itens, o nome ou o tipo, a lista foi finalizada ou excluída, ou o acesso de quem
 * vê (convite aceito, permissão nova, pessoa removida).
 */
export const MOTIVOS_MUDANCA_LISTA = [
  'itens',
  'lista',
  'finalizada',
  'excluida',
  'acesso',
] as const;
export type MotivoMudancaLista = (typeof MOTIVOS_MUDANCA_LISTA)[number];

/** Corpo de `lista:entrar` e `lista:sair`. */
export const esquemaSalaLista = z.object({ listaId: z.uuid() });
export type DadosSalaLista = z.infer<typeof esquemaSalaLista>;

/** Resposta (ack) de `lista:entrar` e `lista:sair`: o código é o do catálogo de erros. */
export type RespostaSalaLista = { ok: true } | { ok: false; codigo: CodigoErro };

/** Corpo de `lista:mudou`. */
export const esquemaListaMudou = z.object({
  listaId: z.uuid(),
  motivo: z.enum(MOTIVOS_MUDANCA_LISTA),
});
export type ListaMudou = z.infer<typeof esquemaListaMudou>;

export const salaDaLista = (listaId: string) => `lista:${listaId}`;
export const salaDoUsuario = (usuarioId: string) => `usuario:${usuarioId}`;
