/**
 * Lembretes (T-084a, RN-075 a RN-077): a agenda pura. O caminho com o banco, a rotina e o push
 * está em `lembretes.integracao.spec.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  adiarAte,
  agendar,
  alarmesDe,
  concluir,
  disparar,
  type EstadoLembrete,
  inicioDoMinuto,
  precisaDePush,
} from '../src/modulos/lembretes/dominio/agenda';

const SP = 'America/Sao_Paulo';
const ID = '0199a000-0000-7000-8000-000000000001';
/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');
const as = (iso: string) => new Date(iso);

function lembrete(dados: Partial<EstadoLembrete> = {}): EstadoLembrete {
  return {
    id: ID,
    titulo: 'Tomar remédio',
    dataHora: as('2026-10-16T11:00:00Z'), // sexta, 08:00
    recorrencia: null,
    canais: ['push'],
    adiadoAte: null,
    disparadoEm: null,
    ...dados,
  };
}

describe('agendar (RN-075)', () => {
  it('RN-075 o único fica na data pedida, sem os segundos', () => {
    expect(agendar(as('2026-10-16T11:00:42.123Z'), null, SP)).toEqual({
      ok: true,
      dataHora: as('2026-10-16T11:00:00Z'),
      recorrencia: null,
    });
  });

  it('RN-075 a repetição ganha os dias pela data e começa no primeiro dia da regra', () => {
    // Quinta 20:30: semanal sem dias → toda quinta.
    expect(agendar(as('2026-10-15T23:30:00Z'), 'FREQ=WEEKLY', SP)).toEqual({
      ok: true,
      dataHora: as('2026-10-15T23:30:00Z'),
      recorrencia: 'FREQ=WEEKLY;BYDAY=TH',
    });
    // Na segunda e na sexta: a primeira é a sexta, às 20:30.
    expect(agendar(as('2026-10-15T23:30:00Z'), 'FREQ=WEEKLY;BYDAY=FR,MO', SP)).toEqual({
      ok: true,
      dataHora: as('2026-10-16T23:30:00Z'),
      recorrencia: 'FREQ=WEEKLY;BYDAY=MO,FR',
    });
    expect(agendar(as('2026-10-15T23:30:00Z'), 'FREQ=MONTHLY', SP)).toMatchObject({
      recorrencia: 'FREQ=MONTHLY;BYMONTHDAY=15',
    });
  });

  it('a repetição que acaba antes do primeiro aviso não serve', () => {
    expect(agendar(as('2026-10-16T11:00:00Z'), 'FREQ=DAILY;UNTIL=20261015', SP)).toEqual({
      ok: false,
      motivo: 'repeticao_acabou',
    });
  });

  it('com "depois de", o primeiro aviso é o primeiro depois de agora', () => {
    // Era às 08:00 de 10/10; passou a repetir todo dia: o próximo é amanhã, 16/10, às 08:00.
    expect(agendar(as('2026-10-10T11:00:00Z'), 'FREQ=DAILY', SP, AGORA)).toMatchObject({
      ok: true,
      dataHora: as('2026-10-16T11:00:00Z'),
    });
  });
});

describe('disparar (RN-075, RN-076)', () => {
  it('RN-075 o único toca uma vez e fica esperando o [Feito]', () => {
    const vencido = lembrete({ dataHora: as('2026-10-15T15:00:00Z') });
    expect(disparar(vencido, AGORA, SP)).toEqual({
      avisos: [
        {
          chaveUnica: `lembrete:${ID}:2026-10-15T15:00:00.000Z`,
          ocorrencia: as('2026-10-15T15:00:00Z'),
          adiado: false,
        },
      ],
      mudancas: { disparadoEm: AGORA },
    });
  });

  it('RN-075 a repetição passa para a próxima; parada por dias, toca só uma vez', () => {
    const diaria = lembrete({
      dataHora: as('2026-10-12T11:00:00Z'),
      recorrencia: 'FREQ=DAILY',
    });
    const disparo = disparar(diaria, AGORA, SP);
    expect(disparo.avisos).toHaveLength(1);
    expect(disparo.mudancas).toEqual({ dataHora: as('2026-10-16T11:00:00Z') });
  });

  it('a repetição que acabou fica esperando o [Feito] como o único', () => {
    const ultima = lembrete({
      dataHora: as('2026-10-15T11:00:00Z'),
      recorrencia: 'FREQ=DAILY;UNTIL=20261015',
    });
    expect(disparar(ultima, AGORA, SP).mudancas).toEqual({ disparadoEm: AGORA });
  });

  it('RN-076 a soneca toca com a chave dela; vencendo junto com a ocorrência, toca só a ocorrência', () => {
    const adiado = lembrete({
      dataHora: as('2026-10-15T11:00:00Z'),
      disparadoEm: as('2026-10-15T11:00:00Z'),
      adiadoAte: AGORA,
    });
    expect(disparar(adiado, AGORA, SP)).toEqual({
      avisos: [
        {
          chaveUnica: `lembrete:${ID}:adiado:2026-10-15T15:00:00.000Z`,
          ocorrencia: AGORA,
          adiado: true,
        },
      ],
      mudancas: { adiadoAte: null },
    });
    const junto = lembrete({ dataHora: AGORA, adiadoAte: AGORA, recorrencia: 'FREQ=DAILY' });
    const disparo = disparar(junto, AGORA, SP);
    expect(disparo.avisos.map(({ adiado }) => adiado)).toEqual([false]);
    expect(disparo.mudancas).toEqual({ dataHora: as('2026-10-16T15:00:00Z'), adiadoAte: null });
  });
});

describe('concluir (RN-076)', () => {
  it('RN-076 o único (tocado ou não) e a repetição que acabou ficam feitos', () => {
    expect(concluir(lembrete(), undefined, SP)).toEqual({ concluir: true });
    expect(
      concluir(
        lembrete({ disparadoEm: AGORA, recorrencia: 'FREQ=DAILY' }),
        as('2026-10-01T00:00:00Z'),
        SP,
      ),
    ).toEqual({ concluir: true });
  });

  it('RN-076 na repetição: o [Feito] da atual pula para a próxima; o de uma que passou só tira a soneca', () => {
    const diaria = lembrete({ recorrencia: 'FREQ=DAILY;UNTIL=20261017', adiadoAte: AGORA });
    expect(concluir(diaria, undefined, SP)).toEqual({
      concluir: false,
      mudancas: { dataHora: as('2026-10-17T11:00:00Z'), adiadoAte: null },
    });
    expect(concluir(diaria, as('2026-10-16T11:00:00Z'), SP)).toMatchObject({ concluir: false });
    expect(concluir(diaria, as('2026-10-15T11:00:00Z'), SP)).toEqual({
      concluir: false,
      mudancas: { adiadoAte: null },
    });
    // A última ocorrência: o [Feito] conclui.
    expect(concluir({ ...diaria, dataHora: as('2026-10-17T11:00:00Z') }, undefined, SP)).toEqual({
      concluir: true,
    });
  });
});

describe('adiarAte (RN-076)', () => {
  it('RN-076 10 minutos, 1 hora (sem os segundos) e amanhã na hora do lembrete', () => {
    const agora = as('2026-10-15T15:00:31Z');
    expect(adiarAte(lembrete(), '10min', agora, SP)).toEqual(as('2026-10-15T15:10:00Z'));
    expect(adiarAte(lembrete(), '1h', agora, SP)).toEqual(as('2026-10-15T16:00:00Z'));
    expect(adiarAte(lembrete(), 'amanha', agora, SP)).toEqual(as('2026-10-16T11:00:00Z'));
    // 23:30 de 15/10 em São Paulo já é dia 16 em UTC: amanhã ainda é 16, no fuso dela.
    expect(adiarAte(lembrete(), 'amanha', as('2026-10-16T02:30:00Z'), SP)).toEqual(
      as('2026-10-16T11:00:00Z'),
    );
    expect(inicioDoMinuto(agora)).toEqual(as('2026-10-15T15:00:00Z'));
  });
});

describe('alarmesDe e precisaDePush (doc 09)', () => {
  it('as próximas ocorrências com alarme e a soneca, as mais próximas primeiro', () => {
    const semanal = lembrete({
      dataHora: as('2026-10-19T11:00:00Z'), // segunda, 08:00
      recorrencia: 'FREQ=WEEKLY;BYDAY=MO,WE',
      canais: ['alarme'],
    });
    const adiado = lembrete({
      id: '0199a000-0000-7000-8000-000000000002',
      titulo: 'Ligar para a Bia',
      dataHora: as('2026-10-15T11:00:00Z'),
      disparadoEm: as('2026-10-15T11:00:00Z'),
      adiadoAte: as('2026-10-15T15:10:00Z'),
      canais: ['push', 'alarme'],
    });
    const soPush = lembrete({ id: '0199a000-0000-7000-8000-000000000003' });
    const alarmes = alarmesDe([semanal, adiado, soPush], AGORA, SP);
    expect(alarmes[0]).toEqual({
      id: '0199a000-0000-7000-8000-000000000002-1792077000000',
      lembreteId: '0199a000-0000-7000-8000-000000000002',
      instante: as('2026-10-15T15:10:00Z'),
      titulo: 'Ligar para a Bia',
      corpo: 'Lembrete adiado das 08:00',
    });
    // 35 dias: segundas e quartas de 19/10 a 18/11.
    expect(alarmes.slice(1).map(({ instante }) => instante.toISOString().slice(0, 10))).toEqual([
      '2026-10-19',
      '2026-10-21',
      '2026-10-26',
      '2026-10-28',
      '2026-11-02',
      '2026-11-04',
      '2026-11-09',
      '2026-11-11',
      '2026-11-16',
      '2026-11-18',
    ]);
    expect(alarmes[1]?.corpo).toBe('Lembrete das 08:00');
  });

  it('no máximo 50; a ocorrência que já tocou não volta', () => {
    const diaria = lembrete({ dataHora: as('2026-10-16T11:00:00Z'), recorrencia: 'FREQ=DAILY' });
    const outra = { ...diaria, id: '0199a000-0000-7000-8000-000000000002' };
    const alarmes = alarmesDe(
      [diaria, outra].map((item) => ({ ...item, canais: ['alarme' as const] })),
      AGORA,
      SP,
    );
    expect(alarmes).toHaveLength(50);
    expect(alarmesDe([{ ...diaria, canais: ['alarme'], disparadoEm: AGORA }], AGORA, SP)).toEqual(
      [],
    );
  });

  it('o push vai com o canal notificação, ou só alarme com iPhone', () => {
    expect(precisaDePush(['push'], false)).toBe(true);
    expect(precisaDePush(['alarme'], false)).toBe(false);
    expect(precisaDePush(['alarme'], true)).toBe(true);
  });
});
