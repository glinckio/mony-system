import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { validarAmbiente } from '../src/core/config/ambiente';
import type { Configuracao } from '../src/core/config/configuracao';
import { Cifra, ErroCifra } from '../src/core/cripto/cifra';
import { ErroDominio } from '../src/core/erros/erro-dominio';

const config = (chave: Buffer | undefined, ehProducao = false) =>
  ({ chaveMestraCripto: chave, ehProducao }) as unknown as Configuracao;

describe('cifra dos tokens de terceiros (T-085a, doc 11)', () => {
  const chave = randomBytes(32);

  it('cifra e decifra; o mesmo texto sai diferente a cada vez (chave de dados por valor)', () => {
    const cifra = new Cifra(config(chave));
    const a = cifra.cifrar('token-secreto');
    const b = cifra.cifrar('token-secreto');
    expect(a).not.toBe(b);
    expect(a).not.toContain('token-secreto');
    expect(a.split('.')[0]).toBe('v1');
    expect(cifra.decifrar(a)).toBe('token-secreto');
    expect(cifra.decifrar(b)).toBe('token-secreto');
  });

  it('recusa o texto mexido e o de outra chave mestra', () => {
    const cifra = new Cifra(config(chave));
    const cifrado = cifra.cifrar('token-secreto');
    const [versao, envelope, valor] = cifrado.split('.') as [string, string, string];
    const trocado = `${valor.slice(0, -2)}${valor.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(() => cifra.decifrar(`${versao}.${envelope}.${trocado}`)).toThrow(ErroCifra);
    expect(() => cifra.decifrar('qualquer coisa')).toThrow(ErroCifra);
    expect(() => new Cifra(config(randomBytes(32))).decifrar(cifrado)).toThrow(ErroCifra);
  });

  it('fora de produção, sem chave, usa a de desenvolvimento (a mesma entre subidas)', () => {
    const cifrado = new Cifra(config(undefined)).cifrar('x');
    expect(new Cifra(config(undefined)).decifrar(cifrado)).toBe('x');
  });

  it('em produção, sem chave, fica indisponível e responde 503', () => {
    const cifra = new Cifra(config(undefined, true));
    expect(cifra.disponivel).toBe(false);
    expect(() => cifra.cifrar('x')).toThrow(ErroDominio);
  });

  it('a variável CRIPTO_CHAVE_MESTRA precisa ter 32 bytes em base64', () => {
    const banco = {
      DATABASE_URL: 'postgresql://mony:mony@localhost:5432/mony',
      REDIS_URL: 'redis://localhost:6379',
    };
    expect(
      validarAmbiente({ ...banco, CRIPTO_CHAVE_MESTRA: chave.toString('base64') })
        .CRIPTO_CHAVE_MESTRA,
    ).toBe(chave.toString('base64'));
    expect(validarAmbiente({ ...banco, CRIPTO_CHAVE_MESTRA: '' }).CRIPTO_CHAVE_MESTRA).toBe(
      undefined,
    );
    expect(() =>
      validarAmbiente({ ...banco, CRIPTO_CHAVE_MESTRA: randomBytes(16).toString('base64') }),
    ).toThrow(/CRIPTO_CHAVE_MESTRA/);
  });
});
