import { describe, expect, it } from 'vitest';

import {
  compararVersoes,
  esquemaConfigApp,
  SUGESTOES_CHAT_PADRAO,
  versaoAbaixoDaMinima,
} from './config-app.js';

describe('versões do app', () => {
  it('compara parte a parte como número, não como texto', () => {
    expect(compararVersoes('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compararVersoes('1.2.3', '1.2.3')).toBe(0);
    expect(compararVersoes('0.9.0', '1.0.0')).toBeLessThan(0);
    expect(compararVersoes('2.0.0', '10.0.0')).toBeLessThan(0);
  });

  it('bloqueia só app identificado e abaixo da mínima da plataforma dele', () => {
    const minimas = { ios: '1.2.0', android: '1.3.0' };
    expect(versaoAbaixoDaMinima('1.1.9', 'ios', minimas)).toBe(true);
    expect(versaoAbaixoDaMinima('1.2.0', 'ios', minimas)).toBe(false);
    expect(versaoAbaixoDaMinima('1.2.5', 'android', minimas)).toBe(true);
    expect(versaoAbaixoDaMinima('1.3.0', 'android', minimas)).toBe(false);
    // Sem cabeçalho ou fora do formato (admin, ferramentas): não bloqueia.
    expect(versaoAbaixoDaMinima(undefined, 'ios', minimas)).toBe(false);
    expect(versaoAbaixoDaMinima('1.0', 'ios', minimas)).toBe(false);
    expect(versaoAbaixoDaMinima('1.0.0', undefined, minimas)).toBe(false);
    expect(versaoAbaixoDaMinima('1.0.0', 'web', minimas)).toBe(false);
  });

  it('a configuração padrão é válida', () => {
    expect(
      esquemaConfigApp.safeParse({
        versaoMinima: { ios: '0.0.0', android: '0.0.0' },
        flags: {},
        sugestoesChat: [...SUGESTOES_CHAT_PADRAO],
      }).success,
    ).toBe(true);
  });
});
