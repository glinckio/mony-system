import { describe, expect, it } from 'vitest';

import { inicioDaJanelaDoRitmo, ritmoDaMeta } from './metas.js';

const aporte = (data: string, valorCentavos: number) => ({ data, valorCentavos });

describe('ritmo da meta (RN-063)', () => {
  const base = {
    hoje: '2026-10-15',
    criacao: '2026-01-10',
    prazo: null,
    restanteCentavos: 860_000,
    concluida: false,
    aportes: [],
  };

  it('a janela é o mês de hoje e os dois anteriores', () => {
    expect(inicioDaJanelaDoRitmo('2026-10-15')).toBe('2026-08-01');
    expect(inicioDaJanelaDoRitmo('2026-01-31')).toBe('2025-11-01');
  });

  it('RN-063 média dos 3 meses, o guardado no mês e os meses para completar', () => {
    const ritmo = ritmoDaMeta({
      ...base,
      aportes: [
        aporte('2026-08-05', 40_000),
        aporte('2026-09-05', 50_000),
        aporte('2026-10-01', 30_000),
        aporte('2026-10-14', 15_000),
      ],
    });
    expect(ritmo).toEqual({
      guardadoNoMesCentavos: 45_000,
      ritmoMensalCentavos: 45_000,
      // 8.600 / 450 = 19,1 → 20 meses (o mês que sobra também conta).
      mesesParaConcluir: 20,
      necessarioPorMesCentavos: null,
    });
  });

  it('RN-063 meta nova: média só dos meses em que existia, sem o saldo inicial do dia da criação', () => {
    const ritmo = ritmoDaMeta({
      ...base,
      criacao: '2026-09-20',
      aportes: [
        aporte('2026-09-20', 600_000),
        aporte('2026-09-25', 20_000),
        aporte('2026-10-03', 40_000),
      ],
    });
    // Setembro e outubro: (200 + 400) / 2.
    expect(ritmo.ritmoMensalCentavos).toBe(30_000);
    expect(ritmo.guardadoNoMesCentavos).toBe(40_000);
    expect(ritmo.mesesParaConcluir).toBe(29);

    const soSaldoInicial = ritmoDaMeta({
      ...base,
      criacao: '2026-10-15',
      aportes: [aporte('2026-10-15', 640_000)],
    });
    expect(soSaldoInicial).toMatchObject({
      guardadoNoMesCentavos: 640_000,
      ritmoMensalCentavos: 0,
      mesesParaConcluir: null,
    });
  });

  it('RN-063 com prazo: quanto guardar por mês, do mês de hoje ao do prazo', () => {
    // Outubro/2026 a dezembro/2027: 15 meses.
    expect(ritmoDaMeta({ ...base, prazo: '2027-12-31' }).necessarioPorMesCentavos).toBe(57_334);
    // Prazo neste mês: tudo agora; vencido: sem conta.
    expect(ritmoDaMeta({ ...base, prazo: '2026-10-31' }).necessarioPorMesCentavos).toBe(860_000);
    expect(ritmoDaMeta({ ...base, prazo: '2026-09-30' }).necessarioPorMesCentavos).toBeNull();
  });

  it('meta concluída ou já no alvo não tem projeção, mas mostra o que entrou no mês', () => {
    const aportes = [aporte('2026-10-02', 10_000)];
    for (const meta of [
      { ...base, concluida: true },
      { ...base, restanteCentavos: 0 },
    ]) {
      expect(ritmoDaMeta({ ...meta, prazo: '2027-12-31', aportes })).toEqual({
        guardadoNoMesCentavos: 10_000,
        ritmoMensalCentavos: 3_333,
        mesesParaConcluir: null,
        necessarioPorMesCentavos: null,
      });
    }
  });
});
