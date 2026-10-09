import { describe, expect, it } from 'vitest';

import {
  esquemaCadastro,
  esquemaLogin,
  normalizarEmail,
  normalizarTelefoneBr,
  VERSOES_DOCUMENTOS,
} from './autenticacao.js';

const cadastroValido = {
  nome: 'Ana Souza',
  email: 'ana@exemplo.com',
  telefone: '(11) 98765-4321',
  senha: 'segredo123',
  aceites: { ...VERSOES_DOCUMENTOS },
  dispositivo: { identificador: 'aparelho-0001', plataforma: 'ios' },
};

describe('normalizarEmail', () => {
  it('RN-001 e-mail comparado em minúsculas e sem espaços nas pontas', () => {
    expect(normalizarEmail('  Ana.Souza@Exemplo.COM ')).toBe('ana.souza@exemplo.com');
  });
});

describe('normalizarTelefoneBr', () => {
  it.each([
    ['(11) 98765-4321', '+5511987654321'],
    ['11987654321', '+5511987654321'],
    ['+55 11 98765-4321', '+5511987654321'],
    ['5511987654321', '+5511987654321'],
    ['(21) 3456-7890', '+552134567890'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarTelefoneBr(entrada)).toBe(esperado);
  });

  it.each(['', '123', '(01) 98765-4321', '(11) 88765-43210', '11 8765-432', '+1 415 555 2671'])(
    'recusa %s',
    (entrada) => {
      expect(normalizarTelefoneBr(entrada)).toBeNull();
    },
  );
});

describe('esquemaCadastro', () => {
  it('RN-001 aceita nome, e-mail, telefone e senha de 8 caracteres', () => {
    expect(esquemaCadastro.safeParse(cadastroValido).success).toBe(true);
  });

  it('RN-001 recusa senha com menos de 8 caracteres', () => {
    expect(esquemaCadastro.safeParse({ ...cadastroValido, senha: '1234567' }).success).toBe(false);
  });

  it('RN-001 telefone é obrigatório e precisa ser válido', () => {
    expect(esquemaCadastro.safeParse({ ...cadastroValido, telefone: undefined }).success).toBe(
      false,
    );
    expect(esquemaCadastro.safeParse({ ...cadastroValido, telefone: '123' }).success).toBe(false);
  });

  it('RN-007 exige as versões aceitas dos termos e da privacidade', () => {
    expect(esquemaCadastro.safeParse({ ...cadastroValido, aceites: {} }).success).toBe(false);
  });

  it('recusa e-mail inválido e plataforma desconhecida', () => {
    expect(esquemaCadastro.safeParse({ ...cadastroValido, email: 'ana' }).success).toBe(false);
    expect(
      esquemaCadastro.safeParse({
        ...cadastroValido,
        dispositivo: { identificador: 'aparelho-0001', plataforma: 'web' },
      }).success,
    ).toBe(false);
  });
});

describe('esquemaLogin', () => {
  it('senha de qualquer tamanho até o máximo (quem já tem conta não é barrado pela regra)', () => {
    expect(
      esquemaLogin.safeParse({
        email: 'ana@exemplo.com',
        senha: 'x',
        dispositivo: { identificador: 'aparelho-0001', plataforma: 'android' },
      }).success,
    ).toBe(true);
  });
});
