import type { Competencia } from '@mony/shared/datas';
import type {
  FormaPagamento,
  OrigemTransacao,
  StatusTransacao,
  TipoTransacao,
} from '@mony/shared/enums';
import type { FiltroTransacoes } from '@mony/shared/transacoes';

import { periodoDoMes } from './periodo';

/**
 * O que a pessoa escolheu na tela: o mês, a busca e os filtros da RN-047. A API calcula a lista e
 * os totais com os mesmos parâmetros.
 */
export interface FiltroDaTela {
  competencia: Competencia;
  texto: string;
  tipo?: TipoTransacao;
  status?: StatusTransacao;
  categoriaId?: string;
  formaPagamento?: FormaPagamento;
  cartaoId?: string;
  contaId?: string;
  origem?: OrigemTransacao;
}

/** Os campos que a folha de filtros escolhe (o mês e a busca ficam na tela). */
export type FiltrosDaFolha = Omit<FiltroDaTela, 'competencia' | 'texto'>;

const TAMANHO_MAXIMO_BUSCA = 100;

/** Parâmetros de `GET /transacoes` e `GET /transacoes/totais`: só o que tem valor. */
export function parametrosDoFiltro(filtro: FiltroDaTela): FiltroTransacoes {
  const { competencia, texto, ...resto } = filtro;
  const busca = texto.trim().slice(0, TAMANHO_MAXIMO_BUSCA);
  return limparVazios({
    ...periodoDoMes(competencia),
    ...resto,
    ...(busca === '' ? {} : { texto: busca }),
  });
}

/** Os chips do design: Todas, Despesas, Receitas e Pendentes. */
export const ATALHOS = ['todas', 'despesas', 'receitas', 'pendentes'] as const;
export type Atalho = (typeof ATALHOS)[number];

const FILTRO_DO_ATALHO: Record<Atalho, Pick<FiltroDaTela, 'tipo' | 'status'>> = {
  todas: { tipo: undefined, status: undefined },
  despesas: { tipo: 'despesa', status: undefined },
  receitas: { tipo: 'receita', status: undefined },
  pendentes: { tipo: undefined, status: 'pendente' },
};

/** O chip aceso. Combinação feita na folha (ex.: despesas pendentes) não acende nenhum. */
export function atalhoAtivo(filtro: Pick<FiltroDaTela, 'tipo' | 'status'>): Atalho | null {
  return (
    ATALHOS.find(
      (atalho) =>
        FILTRO_DO_ATALHO[atalho].tipo === filtro.tipo &&
        FILTRO_DO_ATALHO[atalho].status === filtro.status,
    ) ?? null
  );
}

/** Tocar num chip troca tipo e situação; os outros filtros continuam. */
export function aplicarAtalho(filtro: FiltroDaTela, atalho: Atalho): FiltroDaTela {
  return limparVazios({ ...filtro, ...FILTRO_DO_ATALHO[atalho] });
}

/** Filtros da folha que os chips não mostram (categoria, forma, cartão, conta, origem). */
export function quantosFiltrosNaFolha(filtro: FiltroDaTela): number {
  const extras = [
    filtro.categoriaId,
    filtro.formaPagamento,
    filtro.cartaoId,
    filtro.contaId,
    filtro.origem,
  ].filter((valor) => valor !== undefined).length;
  // Tipo e situação que nenhum chip mostra (ex.: despesas pendentes) contam na folha.
  const semChip = atalhoAtivo(filtro) === null;
  const tipoEStatus = [filtro.tipo, filtro.status].filter((valor) => valor !== undefined).length;
  return extras + (semChip ? tipoEStatus : 0);
}

export function temFiltro(filtro: FiltroDaTela): boolean {
  return (
    filtro.texto.trim() !== '' ||
    atalhoAtivo(filtro) !== 'todas' ||
    quantosFiltrosNaFolha(filtro) > 0
  );
}

export function filtrosDaFolha(filtro: FiltroDaTela): FiltrosDaFolha {
  const { tipo, status, categoriaId, formaPagamento, cartaoId, contaId, origem } = filtro;
  return limparVazios({ tipo, status, categoriaId, formaPagamento, cartaoId, contaId, origem });
}

/** A folha devolve todos os filtros dela de uma vez; o mês e a busca ficam como estavam. */
export function aplicarFolha(filtro: FiltroDaTela, folha: FiltrosDaFolha): FiltroDaTela {
  return limparVazios({ competencia: filtro.competencia, texto: filtro.texto, ...folha });
}

/** Sem chaves com `undefined`, para dois filtros iguais virarem a mesma chave de cache. */
function limparVazios<T extends object>(objeto: T): T {
  return Object.fromEntries(Object.entries(objeto).filter(([, valor]) => valor !== undefined)) as T;
}
