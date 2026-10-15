import { describe, expect, it } from 'vitest';

import { CifraSegredos } from '../src/core/auth/cifra-segredos';
import {
  codigoTotp,
  conferirTotp,
  deBase32,
  enderecoTotp,
  gerarSegredoTotp,
  paraBase32,
  passoTotp,
} from '../src/core/auth/totp';
import type { Configuracao } from '../src/core/config/configuracao';

/** O segredo dos vetores do RFC 6238 (SHA-1): "12345678901234567890" em ASCII. */
const SEGREDO_RFC = paraBase32(Buffer.from('12345678901234567890'));

describe('2FA do painel admin: TOTP (T-104a)', () => {
  it('base32 de ida e volta, e o segredo do RFC', () => {
    expect(SEGREDO_RFC).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(deBase32(SEGREDO_RFC).toString()).toBe('12345678901234567890');
    const segredo = gerarSegredoTotp();
    expect(segredo).toMatch(/^[A-Z2-7]{32}$/);
    expect(paraBase32(deBase32(segredo))).toBe(segredo);
  });

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('vetor do RFC 6238 em %i s: %s', (segundos, esperado) => {
    const passo = passoTotp(new Date(segundos * 1000));
    expect(codigoTotp(SEGREDO_RFC, passo, 8)).toBe(esperado);
    expect(codigoTotp(SEGREDO_RFC, passo)).toBe(esperado.slice(2));
  });

  it('aceita o passo anterior e o seguinte, e devolve o passo que bateu', () => {
    const agora = new Date('2026-10-15T21:00:10.000Z');
    const passo = passoTotp(agora);
    expect(conferirTotp(SEGREDO_RFC, codigoTotp(SEGREDO_RFC, passo), agora)).toBe(passo);
    expect(conferirTotp(SEGREDO_RFC, codigoTotp(SEGREDO_RFC, passo - 1), agora)).toBe(passo - 1);
    expect(conferirTotp(SEGREDO_RFC, codigoTotp(SEGREDO_RFC, passo + 1), agora)).toBe(passo + 1);
    expect(conferirTotp(SEGREDO_RFC, codigoTotp(SEGREDO_RFC, passo - 2), agora)).toBeNull();
    expect(conferirTotp(SEGREDO_RFC, '12345', agora)).toBeNull();
    expect(conferirTotp(SEGREDO_RFC, 'abcdef', agora)).toBeNull();
  });

  it('o endereço do QR Code leva o emissor, a conta e o segredo', () => {
    expect(enderecoTotp('ABC234', 'ana@exemplo.com')).toBe(
      'otpauth://totp/Monitorizze%3Aana%40exemplo.com?secret=ABC234&issuer=Monitorizze&algorithm=SHA1&digits=6&period=30',
    );
  });
});

describe('cifra dos segredos guardados (T-104a)', () => {
  const cifra = new CifraSegredos({ chavePrivadaJwt: undefined } as Configuracao);

  it('cifra e decifra; cada vez sai um texto diferente', () => {
    const a = cifra.cifrar('GEZDGNBVGY3TQOJQ');
    const b = cifra.cifrar('GEZDGNBVGY3TQOJQ');
    expect(a).not.toBe(b);
    expect(a).not.toContain('GEZDGNBVGY3TQOJQ');
    expect(cifra.decifrar(a)).toBe('GEZDGNBVGY3TQOJQ');
  });

  it('recusa texto mexido ou cifrado com outra chave', () => {
    const guardado = cifra.cifrar('segredo');
    const partes = guardado.split('.');
    partes[3] = Buffer.from('outro texto').toString('base64url');
    expect(() => cifra.decifrar(partes.join('.'))).toThrow();
    const outra = new CifraSegredos({ chavePrivadaJwt: 'outra chave' } as Configuracao);
    expect(() => outra.decifrar(guardado)).toThrow();
  });
});
