import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Configuracao } from '../config/configuracao';

const VERSAO = 'v1';
const ALGORITMO = 'aes-256-gcm';
/**
 * Fora de produção sem `JWT_CHAVE_PRIVADA` (a configuração exige a chave em produção), a cifra usa
 * esta chave fixa: o segredo do 2FA continua legível depois de reiniciar a API local.
 */
const CHAVE_DESENVOLVIMENTO = 'mony-desenvolvimento-sem-chave-jwt';

/**
 * Cifra os segredos guardados no banco (o do 2FA do admin; docs/arquitetura/11) com AES-256-GCM. A
 * chave sai da chave do JWT por HKDF, para não existir mais um segredo para guardar. Trocar a
 * chave do JWT obriga os admins a configurar o 2FA de novo (`pnpm --filter api admin:promover`).
 */
@Injectable()
export class CifraSegredos {
  private readonly chave: Buffer;

  constructor(config: Configuracao) {
    const base = config.chavePrivadaJwt ?? CHAVE_DESENVOLVIMENTO;
    this.chave = Buffer.from(hkdfSync('sha256', base, 'mony', 'segredos-guardados-v1', 32));
  }

  /** `v1.<iv>.<tag>.<texto cifrado>`, em base64url. */
  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const cifra = createCipheriv(ALGORITMO, this.chave, iv);
    const cifrado = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()]);
    return [VERSAO, iv, cifra.getAuthTag(), cifrado]
      .map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url')))
      .join('.');
  }

  /** Lança se o texto foi mexido ou cifrado com outra chave. */
  decifrar(guardado: string): string {
    const [versao, iv, tag, cifrado] = guardado.split('.');
    if (versao !== VERSAO || !iv || !tag || cifrado === undefined) {
      throw new Error('Segredo guardado em formato desconhecido');
    }
    const decifra = createDecipheriv(ALGORITMO, this.chave, Buffer.from(iv, 'base64url'));
    decifra.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decifra.update(Buffer.from(cifrado, 'base64url')),
      decifra.final(),
    ]).toString('utf8');
  }
}
