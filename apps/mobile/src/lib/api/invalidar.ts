import type { QueryClient } from '@tanstack/react-query';

/**
 * Rotas cujos dados mudam com um lançamento: a lista e os totais, o Início, cartões e faturas
 * (limite e total), orçamentos, saldo das contas e relatórios (doc 04, "Regras de cache").
 */
const ROTAS_FINANCEIRAS = [
  '/v1/transacoes',
  '/v1/dashboard',
  '/v1/cartoes',
  '/v1/faturas',
  '/v1/orcamentos',
  '/v1/contas',
  '/v1/relatorios',
] as const;

/** A chave das consultas geradas começa pela URL (`['/v1/transacoes', filtro]`). */
function ehDadoFinanceiro(chave: readonly unknown[]): boolean {
  const [rota] = chave;
  return (
    typeof rota === 'string' &&
    ROTAS_FINANCEIRAS.some((prefixo) => rota === prefixo || rota.startsWith(`${prefixo}/`))
  );
}

/** Depois de qualquer mutação financeira: as telas abertas buscam de novo, as outras ao abrir. */
export function invalidarDadosFinanceiros(cliente: QueryClient): Promise<void> {
  return cliente.invalidateQueries({ predicate: ({ queryKey }) => ehDadoFinanceiro(queryKey) });
}
