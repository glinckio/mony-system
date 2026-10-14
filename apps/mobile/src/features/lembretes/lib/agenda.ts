import { type DataCalendario, dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import type { Lembrete } from '@mony/shared/lembretes';
import { somarDias } from '@mony/shared/recorrencias';

/** A data e a hora de um instante da API no fuso do usuário. */
export function momentoLocal(
  instante: string,
  fuso: string,
): { data: DataCalendario; hora: string } {
  const data = new Date(instante);
  return { data: dataNoFuso(data, fuso), hora: horaNoFuso(data, fuso) };
}

export type ChaveGrupo = 'pendentes' | 'hoje' | 'amanha' | 'proximos';

export interface GrupoLembretes {
  chave: ChaveGrupo;
  itens: Lembrete[];
}

/**
 * A aba Próximos (design, página 6): os que já tocaram e esperam o [Feito], os de hoje, os de amanhã
 * e os dos próximos dias, cada grupo na ordem da API (o mais próximo primeiro). Grupo vazio some.
 */
export function agruparProximos(
  lembretes: readonly Lembrete[],
  hoje: DataCalendario,
  fuso: string,
): GrupoLembretes[] {
  const amanha = somarDias(hoje, 1);
  const grupos: Record<ChaveGrupo, Lembrete[]> = {
    pendentes: [],
    hoje: [],
    amanha: [],
    proximos: [],
  };
  for (const lembrete of lembretes) {
    if (lembrete.pendente) {
      grupos.pendentes.push(lembrete);
      continue;
    }
    const { data } = momentoLocal(lembrete.dataHora, fuso);
    if (data <= hoje) grupos.hoje.push(lembrete);
    else if (data === amanha) grupos.amanha.push(lembrete);
    else grupos.proximos.push(lembrete);
  }
  return (['pendentes', 'hoje', 'amanha', 'proximos'] as const)
    .map((chave) => ({ chave, itens: grupos[chave] }))
    .filter(({ itens }) => itens.length > 0);
}

/** O canal que vira o selo do lembrete: o alarme, quando tem; senão, o push. */
export function canalPrincipal(lembrete: Pick<Lembrete, 'canais'>): 'alarme' | 'push' {
  return lembrete.canais.includes('alarme') ? 'alarme' : 'push';
}
