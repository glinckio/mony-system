import { describe, expect, it } from 'vitest';

import { horaNoFuso } from './datas.js';
import {
  esquemaAtualizacaoPreferenciasAlerta,
  esquemaConsultaNotificacoes,
  noSilencio,
  REGEX_LINK_INTERNO,
} from './notificacoes.js';

describe('horário de silêncio (RN-101)', () => {
  it('janela no mesmo dia: o início conta, o fim não', () => {
    expect(noSilencio('12:59', '13:00', '14:00')).toBe(false);
    expect(noSilencio('13:00', '13:00', '14:00')).toBe(true);
    expect(noSilencio('14:00', '13:00', '14:00')).toBe(false);
  });

  it('janela que passa da meia-noite', () => {
    expect(noSilencio('21:59', '22:00', '07:00')).toBe(false);
    expect(noSilencio('23:30', '22:00', '07:00')).toBe(true);
    expect(noSilencio('03:00', '22:00', '07:00')).toBe(true);
    expect(noSilencio('07:00', '22:00', '07:00')).toBe(false);
  });

  it('início igual ao fim é sem silêncio', () => {
    expect(noSilencio('10:00', '10:00', '10:00')).toBe(false);
  });

  it('a hora é a do fuso do usuário', () => {
    const instante = new Date('2026-10-15T01:30:00Z');
    expect(horaNoFuso(instante, 'America/Sao_Paulo')).toBe('22:30');
    expect(horaNoFuso(instante, 'UTC')).toBe('01:30');
    expect(horaNoFuso(new Date('2026-10-15T03:00:00Z'), 'America/Sao_Paulo')).toBe('00:00');
  });
});

describe('contratos', () => {
  it('link interno do app (RN-105)', () => {
    expect(REGEX_LINK_INTERNO.test('mony://cartoes/0199c0de/faturas/0199c0df')).toBe(true);
    expect(REGEX_LINK_INTERNO.test('mony://inicio')).toBe(true);
    expect(REGEX_LINK_INTERNO.test('https://exemplo.test')).toBe(false);
  });

  it('silêncio com horas válidas e diferentes', () => {
    const valida = (silencio: unknown) =>
      esquemaAtualizacaoPreferenciasAlerta.safeParse({ silencio }).success;
    expect(valida({ inicio: '22:00', fim: '07:00' })).toBe(true);
    expect(valida(null)).toBe(true);
    expect(valida({ inicio: '24:00', fim: '07:00' })).toBe(false);
    expect(valida({ inicio: '07:00', fim: '07:00' })).toBe(false);
  });

  it('naoLidas vem como texto da query', () => {
    expect(esquemaConsultaNotificacoes.parse({ naoLidas: 'true' })).toEqual({
      naoLidas: true,
      limite: 30,
    });
  });
});
