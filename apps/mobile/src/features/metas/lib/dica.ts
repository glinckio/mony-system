import type { MetaDaLista } from '@mony/shared/metas';

/** O que a "Dica da Mony" diz, sobre qual meta. As contas vêm prontas da API (RN-063). */
export type Dica =
  | {
      tipo: 'ritmo';
      meta: MetaDaLista;
      ritmoCentavos: number;
      meses: number;
      /** Quanto guardar por mês para chegar no prazo, quando o ritmo não basta. */
      prazo: { data: string; necessarioCentavos: number } | null;
    }
  | { tipo: 'prazo'; meta: MetaDaLista; data: string; necessarioCentavos: number };

/**
 * A dica da tela de metas (design, página 5): a primeira meta aberta, na ordem da API (pelo prazo),
 * com ritmo ou com prazo. Com ritmo, quando ele termina a meta; se não chega no prazo, também
 * quanto guardar por mês para chegar. Sem ritmo, só o necessário até o prazo.
 */
export function dicaDasMetas(metas: readonly MetaDaLista[]): Dica | null {
  for (const meta of metas) {
    if (meta.concluida) continue;
    const prazo =
      meta.prazo !== null && meta.necessarioPorMesCentavos !== null
        ? { data: meta.prazo, necessarioCentavos: meta.necessarioPorMesCentavos }
        : null;
    if (meta.mesesParaConcluir !== null) {
      return {
        tipo: 'ritmo',
        meta,
        ritmoCentavos: meta.ritmoMensalCentavos,
        meses: meta.mesesParaConcluir,
        prazo: prazo && prazo.necessarioCentavos > meta.ritmoMensalCentavos ? prazo : null,
      };
    }
    if (prazo) return { tipo: 'prazo', meta, ...prazo };
  }
  return null;
}
