import { describe, expect, it } from '@jest/globals';

import { destinoDaSessao } from '@/lib/auth/destino';

describe('destinoDaSessao', () => {
  it('sem sessão vai para o login', () => {
    expect(destinoDaSessao(null)).toBe('auth');
  });

  it('com onboarding pendente vai para o onboarding', () => {
    expect(destinoDaSessao({ id: 'u1', nome: 'Ana', onboardingConcluido: false })).toBe(
      'onboarding',
    );
  });

  it('com onboarding concluído vai para as abas', () => {
    expect(destinoDaSessao({ id: 'u1', nome: 'Ana', onboardingConcluido: true })).toBe('tabs');
  });
});
