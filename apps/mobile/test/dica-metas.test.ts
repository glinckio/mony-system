import { describe, expect, it } from '@jest/globals';
import type { MetaDaLista } from '@mony/shared/metas';

import { dicaDasMetas } from '@/features/metas/lib/dica';

function meta(dados: Partial<MetaDaLista>): MetaDaLista {
  return {
    id: '0199a000-0000-7000-8000-000000000001',
    titulo: 'Reserva',
    valorAlvoCentavos: 1_500_000,
    valorAtualCentavos: 640_000,
    restanteCentavos: 860_000,
    percentual: 42,
    prazo: null,
    concluida: false,
    guardadoNoMesCentavos: 0,
    ritmoMensalCentavos: 0,
    mesesParaConcluir: null,
    necessarioPorMesCentavos: null,
    ...dados,
  };
}

describe('dica da Mony nas metas (RN-063)', () => {
  it('sem ritmo nem prazo, ou só concluídas: sem dica', () => {
    expect(dicaDasMetas([])).toBeNull();
    expect(dicaDasMetas([meta({})])).toBeNull();
    expect(
      dicaDasMetas([meta({ concluida: true, mesesParaConcluir: 3, ritmoMensalCentavos: 10 })]),
    ).toBeNull();
  });

  it('com ritmo que chega no prazo, só os meses; que não chega, também o necessário', () => {
    const noPrazo = meta({
      prazo: '2027-12-31',
      ritmoMensalCentavos: 60_000,
      mesesParaConcluir: 15,
      necessarioPorMesCentavos: 57_334,
    });
    expect(dicaDasMetas([noPrazo])).toMatchObject({ tipo: 'ritmo', meses: 15, prazo: null });
    expect(dicaDasMetas([{ ...noPrazo, ritmoMensalCentavos: 45_000 }])).toMatchObject({
      tipo: 'ritmo',
      ritmoCentavos: 45_000,
      prazo: { data: '2027-12-31', necessarioCentavos: 57_334 },
    });
  });

  it('pula a meta sem conta e usa a próxima; sem ritmo, só o necessário até o prazo', () => {
    const viagem = meta({
      id: '0199a000-0000-7000-8000-000000000002',
      titulo: 'Viagem',
      prazo: '2027-07-31',
      necessarioPorMesCentavos: 59_000,
    });
    expect(dicaDasMetas([meta({}), viagem])).toEqual({
      tipo: 'prazo',
      meta: viagem,
      data: '2027-07-31',
      necessarioCentavos: 59_000,
    });
  });
});
