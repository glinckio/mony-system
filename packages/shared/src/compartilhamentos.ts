/**
 * Compartilhamento de listas (RN-074, T-124a): convite para quem já tem conta, pelo e-mail ou pelo
 * telefone, com permissão `ver` ou `editar`. Os lembretes entram com a T-124c.
 */
import { z } from 'zod';

import { PERMISSOES_COMPARTILHAMENTO, STATUS_CONVITE } from './enums.js';

/** Os recursos que já podem ser compartilhados (a lista de compras; o lembrete na T-124c). */
export const RECURSOS_COM_CONVITE = ['lista'] as const;

/** Decisão técnica: convites que uma pessoa manda por hora (o convite revela se o contato tem conta). */
export const MAXIMO_CONVITES_POR_HORA = 20;

/** Como a lista chega a quem a vê: dona, ou convidada com `ver` ou `editar`. */
export const ACESSOS_LISTA = ['dono', ...PERMISSOES_COMPARTILHAMENTO] as const;
export type AcessoLista = (typeof ACESSOS_LISTA)[number];

/** `POST /compartilhamentos`: o contato é o e-mail ou o telefone da conta do convidado. */
export const esquemaNovoCompartilhamento = z.object({
  recurso: z.enum(RECURSOS_COM_CONVITE),
  recursoId: z.uuid(),
  contato: z.string().trim().min(3).max(254),
  permissao: z.enum(PERMISSOES_COMPARTILHAMENTO),
});

/** `PATCH /compartilhamentos/:id`: o dono muda a permissão. */
export const esquemaAtualizacaoCompartilhamento = z.object({
  permissao: z.enum(PERMISSOES_COMPARTILHAMENTO),
});

export const esquemaPessoaCompartilhamento = z.object({ id: z.uuid(), nome: z.string() });

export const esquemaCompartilhamento = z.object({
  id: z.uuid(),
  recurso: z.enum(RECURSOS_COM_CONVITE),
  recursoId: z.uuid(),
  /** O nome da lista, para o convite dizer o que é. */
  recursoNome: z.string(),
  permissao: z.enum(PERMISSOES_COMPARTILHAMENTO),
  status: z.enum(STATUS_CONVITE),
  dono: esquemaPessoaCompartilhamento,
  convidado: esquemaPessoaCompartilhamento,
  criadoEm: z.iso.datetime(),
});

/**
 * `GET /compartilhamentos`: os recebidos (pendentes e aceitos; recusado some) e os enviados (todos,
 * para o dono ver quem recusou), os mais novos primeiro.
 */
export const esquemaListaCompartilhamentos = z.object({
  recebidos: z.array(esquemaCompartilhamento),
  enviados: z.array(esquemaCompartilhamento),
});

export type DadosNovoCompartilhamento = z.infer<typeof esquemaNovoCompartilhamento>;
export type DadosAtualizacaoCompartilhamento = z.infer<typeof esquemaAtualizacaoCompartilhamento>;
export type Compartilhamento = z.infer<typeof esquemaCompartilhamento>;
export type ListaCompartilhamentos = z.infer<typeof esquemaListaCompartilhamentos>;
