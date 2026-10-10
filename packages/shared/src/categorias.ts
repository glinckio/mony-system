/**
 * Contrato das categorias (RN-065, RN-066; rotas em docs/arquitetura/05).
 */
import { z } from 'zod';

import { TIPOS_CATEGORIA } from './enums.js';

/** Cor em hexadecimal, `#RRGGBB`. */
export const REGEX_COR = /^#[0-9A-Fa-f]{6}$/;

/** Chave do ícone; o app mapeia para o ícone do design system. */
export const REGEX_ICONE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const TAMANHO_MAXIMO_NOME_CATEGORIA = 40;

/**
 * RN-065: o nome é único por usuário e tipo, sem diferença entre maiúsculas e minúsculas nem
 * espaços nas pontas ("Mercado" e " mercado " são a mesma categoria). Acentos contam.
 */
export function chaveNomeCategoria(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

const esquemaNomeCategoria = z.string().trim().min(1).max(TAMANHO_MAXIMO_NOME_CATEGORIA);

export const esquemaCategoria = z.object({
  id: z.uuid(),
  nome: z.string(),
  tipo: z.enum(TIPOS_CATEGORIA),
  cor: z.string(),
  icone: z.string(),
  /** Criada no cadastro, a partir da lista padrão. Pode ser editada e excluída como as outras. */
  padrao: z.boolean(),
});

export const esquemaListaCategorias = z.object({ itens: z.array(esquemaCategoria) });

export const esquemaFiltroCategorias = z.object({ tipo: z.enum(TIPOS_CATEGORIA).optional() });

export const esquemaNovaCategoria = z.object({
  nome: esquemaNomeCategoria,
  tipo: z.enum(TIPOS_CATEGORIA),
  cor: z.string().regex(REGEX_COR, 'Cor no formato #RRGGBB'),
  icone: z.string().max(40).regex(REGEX_ICONE, 'Chave do ícone, ex.: mercado'),
});

/** O tipo não muda: os lançamentos da categoria são todos de um tipo só. */
export const esquemaAtualizacaoCategoria = esquemaNovaCategoria.omit({ tipo: true }).partial();

/** RN-066: para qual categoria do mesmo tipo vão os lançamentos da excluída. */
export const esquemaExclusaoCategoria = z.object({ mover_para: z.uuid().optional() });

export type Categoria = z.infer<typeof esquemaCategoria>;
export type ListaCategorias = z.infer<typeof esquemaListaCategorias>;
export type FiltroCategorias = z.infer<typeof esquemaFiltroCategorias>;
export type DadosNovaCategoria = z.infer<typeof esquemaNovaCategoria>;
export type DadosAtualizacaoCategoria = z.infer<typeof esquemaAtualizacaoCategoria>;
export type DadosExclusaoCategoria = z.infer<typeof esquemaExclusaoCategoria>;
