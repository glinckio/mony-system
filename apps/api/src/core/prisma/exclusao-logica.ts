import { Prisma } from '../../generated/prisma/client';

/** Modelos com exclusão lógica pela coluna `excluido_em` (docs/arquitetura/06). */
export const MODELOS_COM_EXCLUSAO_LOGICA: ReadonlySet<string> = new Set<Prisma.ModelName>([
  'Categoria',
  'Cartao',
  'Parcelamento',
  'Transacao',
]);

const OPERACOES_DE_LEITURA: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Acrescenta `excluidoEm: null` ao `where` das leituras dos modelos com exclusão lógica, para que
 * registro excluído nunca apareça por engano. Quem precisa dele passa `excluidoEm` no `where`:
 * `{ not: null }` traz só os excluídos e `undefined` traz todos.
 *
 * Limite: vale para a consulta principal. Relações carregadas com `include` não são filtradas.
 */
export function comFiltroDeExclusao(
  modelo: string | undefined,
  operacao: string,
  args: unknown,
): unknown {
  if (modelo === undefined || !MODELOS_COM_EXCLUSAO_LOGICA.has(modelo)) return args;
  if (!OPERACOES_DE_LEITURA.has(operacao)) return args;
  const atuais = (typeof args === 'object' && args !== null ? args : {}) as {
    where?: Record<string, unknown>;
  };
  const where = atuais.where ?? {};
  if ('excluidoEm' in where) return args;
  return { ...atuais, where: { ...where, excluidoEm: null } };
}

/** Extensão do Prisma Client que aplica `comFiltroDeExclusao` em toda consulta. */
export const exclusaoLogica = Prisma.defineExtension({
  name: 'exclusao-logica',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        return query(comFiltroDeExclusao(model, operation, args) as typeof args);
      },
    },
  },
});
