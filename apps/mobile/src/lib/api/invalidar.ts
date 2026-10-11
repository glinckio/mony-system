import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Rotas cujos dados mudam com um lançamento: a lista e os totais, o Início, cartões e faturas
 * (limite e total), orçamentos, saldo das contas, relatórios, recorrências (excluir "todas" para
 * a recorrência) e parcelamentos (doc 04, "Regras de cache").
 */
const ROTAS_FINANCEIRAS = [
  '/v1/transacoes',
  '/v1/dashboard',
  '/v1/cartoes',
  '/v1/faturas',
  '/v1/orcamentos',
  '/v1/contas',
  '/v1/relatorios',
  '/v1/recorrencias',
  '/v1/parcelamentos',
] as const;

/** A chave das consultas geradas começa pela URL (`['/v1/transacoes', filtro]`). */
function ehDadoFinanceiro(chave: readonly unknown[]): boolean {
  const [rota] = chave;
  return (
    typeof rota === 'string' &&
    ROTAS_FINANCEIRAS.some((prefixo) => rota === prefixo || rota.startsWith(`${prefixo}/`))
  );
}

/**
 * Depois de qualquer mutação financeira: as telas abertas buscam de novo, as outras ao abrir.
 * `semBuscar` é a consulta do que acabou de sair (ex.: o lançamento excluído): fica velha, mas não
 * é buscada agora, porque a resposta seria 404 na tela que está fechando.
 */
export function invalidarDadosFinanceiros(
  cliente: QueryClient,
  semBuscar?: QueryKey,
): Promise<void> {
  const ehOExcluido = (chave: QueryKey) =>
    semBuscar !== undefined && hashKey(chave) === hashKey(semBuscar);
  return Promise.all([
    cliente.invalidateQueries({
      predicate: ({ queryKey }) => ehDadoFinanceiro(queryKey) && !ehOExcluido(queryKey),
    }),
    semBuscar === undefined
      ? Promise.resolve()
      : cliente.invalidateQueries({ queryKey: semBuscar, exact: true, refetchType: 'none' }),
  ]).then(() => undefined);
}
