import { renovarAdminAutenticacao } from '@mony/api-client';
import type { SessaoAdmin } from '@mony/shared/admin';

/**
 * A sessão do painel (T-104a): fica na memória e na `sessionStorage` (some ao fechar a aba; nunca
 * na `localStorage`, docs/arquitetura/11). O token dura 15 minutos e é renovado um minuto antes de
 * vencer, até 8 horas depois do login; aí a API recusa e o painel volta para o login.
 */
const CHAVE = 'mony-admin-sessao';
/** Quanto antes de vencer o token o painel pede um novo. */
export const ANTECEDENCIA_RENOVACAO_MS = 60_000;

let atual: SessaoAdmin | null = null;
let carregada = false;
let temporizador: ReturnType<typeof setTimeout> | undefined;
const ouvintes = new Set<() => void>();

function guardada(): SessaoAdmin | null {
  try {
    const texto = sessionStorage.getItem(CHAVE);
    return texto ? (JSON.parse(texto) as SessaoAdmin) : null;
  } catch {
    return null;
  }
}

function avisar() {
  for (const ouvinte of ouvintes) ouvinte();
}

function agendarRenovacao() {
  clearTimeout(temporizador);
  if (!atual) return;
  const espera = Date.parse(atual.expiraEm) - Date.now() - ANTECEDENCIA_RENOVACAO_MS;
  temporizador = setTimeout(() => void renovarSessaoAdmin(), Math.max(0, espera));
}

/** A sessão aberta, ou `null`. Token já vencido conta como sem sessão. */
export function sessaoAdmin(): SessaoAdmin | null {
  if (!carregada) {
    carregada = true;
    const anterior = guardada();
    if (anterior && Date.parse(anterior.expiraEm) > Date.now()) {
      atual = anterior;
      agendarRenovacao();
    }
  }
  return atual;
}

export function guardarSessaoAdmin(sessao: SessaoAdmin): void {
  carregada = true;
  atual = sessao;
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(sessao));
  } catch {
    // Sem armazenamento (aba anônima bloqueada): a sessão vale só enquanto a página estiver aberta.
  }
  agendarRenovacao();
  avisar();
}

/** Sair, ou a sessão acabou (8 horas, admin rebaixado ou desativado). */
export function encerrarSessaoAdmin(): void {
  carregada = true;
  atual = null;
  clearTimeout(temporizador);
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // Nada guardado.
  }
  avisar();
}

/** `true` se renovou. Recusada, encerra a sessão: o painel volta para o login. */
export async function renovarSessaoAdmin(): Promise<boolean> {
  if (!sessaoAdmin()) return false;
  try {
    guardarSessaoAdmin(await renovarAdminAutenticacao());
    return true;
  } catch {
    encerrarSessaoAdmin();
    return false;
  }
}

/** Para `useSyncExternalStore`. */
export function ouvirSessaoAdmin(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
