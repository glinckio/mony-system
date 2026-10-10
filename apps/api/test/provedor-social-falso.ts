import { createHash, randomUUID } from 'node:crypto';

import type { ProvedorLoginSocial } from '@mony/shared/enums';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

import {
  type ConfigLoginSocial,
  EMISSORES_LOGIN_SOCIAL,
} from '../src/integracoes/login-social/verificador-login-social';

export const CLIENTE_GOOGLE = 'cliente-teste.apps.googleusercontent.com';
export const CLIENTE_APPLE = 'br.com.monitorizze.teste';

export interface OpcoesToken {
  sub?: string;
  claims?: Record<string, unknown>;
  emitidoEm?: Date;
  validadeSegundos?: number;
  audiencia?: string;
  emissor?: string;
  /** Assina com outra chave, que o JWKS não conhece. */
  chaveEstranha?: boolean;
}

/**
 * Google e Apple de mentira: um par RSA local, o JWKS público dele e `id_token` assinados como
 * os provedores fazem. Serve para conferir a validação de verdade, sem rede.
 */
export async function criarProvedorSocialFalso() {
  const chave = await generateKeyPair('RS256');
  const estranha = await generateKeyPair('RS256');
  const publica = { ...(await exportJWK(chave.publicKey)), kid: 'teste-1', alg: 'RS256' };
  const chaves = createLocalJWKSet({ keys: [publica] });

  const config: ConfigLoginSocial = {
    google: { emissores: EMISSORES_LOGIN_SOCIAL.google, audiencias: [CLIENTE_GOOGLE], chaves },
    apple: { emissores: EMISSORES_LOGIN_SOCIAL.apple, audiencias: [CLIENTE_APPLE], chaves },
  };

  async function token(provedor: ProvedorLoginSocial, opcoes: OpcoesToken = {}): Promise<string> {
    const emitido = Math.floor((opcoes.emitidoEm ?? new Date()).getTime() / 1000);
    // `jti` como o Google manda: dois tokens no mesmo segundo não saem iguais.
    return new SignJWT({ email_verified: true, jti: randomUUID(), ...opcoes.claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'teste-1' })
      .setIssuer(opcoes.emissor ?? EMISSORES_LOGIN_SOCIAL[provedor][0] ?? '')
      .setAudience(opcoes.audiencia ?? (provedor === 'google' ? CLIENTE_GOOGLE : CLIENTE_APPLE))
      .setSubject(opcoes.sub ?? `sub-${randomUUID()}`)
      .setIssuedAt(emitido)
      .setExpirationTime(emitido + (opcoes.validadeSegundos ?? 3600))
      .sign(opcoes.chaveEstranha ? estranha.privateKey : chave.privateKey);
  }

  return { config, token };
}

/** O que o app faz com a Apple: gera um valor aleatório e manda o SHA-256 dele para a Apple. */
export function nonceApple(): { bruto: string; resumo: string } {
  const bruto = randomUUID();
  return { bruto, resumo: createHash('sha256').update(bruto).digest('hex') };
}
