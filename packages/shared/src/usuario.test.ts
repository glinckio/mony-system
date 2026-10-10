import { describe, expect, it } from 'vitest';

import {
  esquemaAtualizacaoOnboarding,
  esquemaAtualizacaoPerfil,
  esquemaRegistroDispositivo,
} from './usuario.js';

describe('atualização do perfil', () => {
  it('aceita só os campos enviados, com as regras do cadastro', () => {
    expect(esquemaAtualizacaoPerfil.safeParse({}).success).toBe(true);
    expect(esquemaAtualizacaoPerfil.safeParse({ nome: 'Ana Lima' }).success).toBe(true);
    expect(esquemaAtualizacaoPerfil.safeParse({ nome: '   ' }).success).toBe(false);
    expect(esquemaAtualizacaoPerfil.safeParse({ telefone: '(11) 98765-4321' }).success).toBe(true);
    expect(esquemaAtualizacaoPerfil.safeParse({ telefone: '123' }).success).toBe(false);
  });

  it('ADR-008 fuso precisa ser IANA', () => {
    expect(esquemaAtualizacaoPerfil.safeParse({ fusoHorario: 'America/Manaus' }).success).toBe(
      true,
    );
    expect(esquemaAtualizacaoPerfil.safeParse({ fusoHorario: 'Brasil/Lugar' }).success).toBe(false);
  });
});

describe('aparelho', () => {
  it('token de push pode ser apagado com null', () => {
    expect(esquemaRegistroDispositivo.safeParse({ tokenPush: null }).success).toBe(true);
    expect(
      esquemaRegistroDispositivo.safeParse({ tokenPush: 'ExponentPushToken[abc123def456]' })
        .success,
    ).toBe(true);
    expect(esquemaRegistroDispositivo.safeParse({}).success).toBe(false);
  });
});

describe('atualização do onboarding', () => {
  it('RN-024 etapas só viram concluída ou dispensada', () => {
    expect(
      esquemaAtualizacaoOnboarding.safeParse({
        etapas: { cartoes: 'dispensada', 'primeiro-lancamento': 'concluida' },
      }).success,
    ).toBe(true);
    expect(
      esquemaAtualizacaoOnboarding.safeParse({ etapas: { cartoes: 'pendente' } }).success,
    ).toBe(false);
    expect(
      esquemaAtualizacaoOnboarding.safeParse({ etapas: { inventada: 'concluida' } }).success,
    ).toBe(false);
  });

  it('chaves de dicas em minúsculas, com pontos separando partes', () => {
    expect(esquemaAtualizacaoOnboarding.safeParse({ dicasVistas: ['inicio.saldo'] }).success).toBe(
      true,
    );
    expect(esquemaAtualizacaoOnboarding.safeParse({ dicasVistas: ['Início Saldo'] }).success).toBe(
      false,
    );
  });
});
