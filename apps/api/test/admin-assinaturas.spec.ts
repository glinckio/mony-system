/** Assinaturas no painel (T-141b): situação de cada conta, MRR e o resumo. */
import { describe, expect, it } from 'vitest';

import { ClockFixo } from '../src/core/clock/clock';
import type { AdminAssinaturasRepository } from '../src/modulos/admin/admin-assinaturas.repository';
import { AdminAssinaturasService } from '../src/modulos/admin/admin-assinaturas.service';
import { calcularMrr, situacaoDaAssinatura } from '../src/modulos/admin/dominio/assinaturas';

const agora = new Date('2026-10-16T12:00:00Z');
const ontem = new Date('2026-10-15T12:00:00Z');
const amanha = new Date('2026-10-17T12:00:00Z');

describe('situacaoDaAssinatura', () => {
  it('teste valendo é teste', () => {
    expect(situacaoDaAssinatura({ plano: 'teste', status: 'ativa', testeFim: amanha }, agora)).toBe(
      'teste',
    );
  });

  it('RN-126 teste vencido já é gratuito, mesmo antes da rotina diária', () => {
    expect(situacaoDaAssinatura({ plano: 'teste', status: 'ativa', testeFim: ontem }, agora)).toBe(
      'gratuito',
    );
  });

  it('sem assinatura é gratuito', () => {
    expect(situacaoDaAssinatura(null, agora)).toBe('gratuito');
  });

  it('plano pago em dia é ativa; com cobrança recusada é inadimplente (RN-131)', () => {
    expect(situacaoDaAssinatura({ plano: 'anual', status: 'ativa', testeFim: null }, agora)).toBe(
      'ativa',
    );
    expect(
      situacaoDaAssinatura({ plano: 'mensal', status: 'inadimplente', testeFim: null }, agora),
    ).toBe('inadimplente');
  });

  it('RN-131 assinatura encerrada é cancelada, e o teste estendido pelo admin vale primeiro', () => {
    expect(
      situacaoDaAssinatura({ plano: 'gratuito', status: 'cancelada', testeFim: null }, agora),
    ).toBe('cancelada');
    expect(
      situacaoDaAssinatura({ plano: 'teste', status: 'cancelada', testeFim: amanha }, agora),
    ).toBe('teste');
  });
});

describe('calcularMrr', () => {
  it('soma o mensal inteiro e um doze avos do anual, arredondando uma vez', () => {
    expect(
      calcularMrr([
        { plano: 'mensal', status: 'ativa', valorCentavos: 1990, quantidade: 3 },
        { plano: 'anual', status: 'ativa', valorCentavos: 19900, quantidade: 2 },
        { plano: 'anual', status: 'ativa', valorCentavos: 19901, quantidade: 1 },
        { plano: 'mensal', status: 'inadimplente', valorCentavos: 1990, quantidade: 1 },
      ]),
    ).toEqual({ ativa: 5970 + Math.round(59701 / 12), inadimplente: 1990 });
  });

  it('sem assinaturas pagas, zero', () => {
    expect(calcularMrr([])).toEqual({ ativa: 0, inadimplente: 0 });
  });
});

describe('AdminAssinaturasService.resumo', () => {
  it('junta as contagens, as pagas por plano e a conversão dos últimos 30 dias', async () => {
    const desdes: Date[] = [];
    const repositorio = {
      contar: (situacao: string) =>
        Promise.resolve(
          { teste: 4, gratuito: 10, ativa: 3, inadimplente: 1, cancelada: 2 }[situacao] ?? 0,
        ),
      gruposPagos: () =>
        Promise.resolve([
          { plano: 'mensal', status: 'ativa', valorCentavos: 1990, quantidade: 2 },
          { plano: 'anual', status: 'ativa', valorCentavos: 19900, quantidade: 1 },
          { plano: 'mensal', status: 'inadimplente', valorCentavos: 1990, quantidade: 1 },
        ]),
      cancelamentosAgendados: () => Promise.resolve(1),
      conversaoTeste: (desde: Date) => {
        desdes.push(desde);
        return Promise.resolve({ encerrados: 8, convertidos: 2 });
      },
    } as unknown as AdminAssinaturasRepository;
    const servico = new AdminAssinaturasService(repositorio, new ClockFixo(agora.toISOString()));

    await expect(servico.resumo()).resolves.toEqual({
      situacoes: { teste: 4, gratuito: 10, ativa: 3, inadimplente: 1, cancelada: 2 },
      pagasPorPlano: { mensal: 3, anual: 1 },
      cancelamentoAgendado: 1,
      mrrCentavos: 3980 + Math.round(19900 / 12),
      mrrInadimplenteCentavos: 1990,
      conversaoTeste: { dias: 30, encerrados: 8, convertidos: 2 },
    });
    expect(desdes).toEqual([new Date('2026-09-16T12:00:00Z')]);
  });
});
