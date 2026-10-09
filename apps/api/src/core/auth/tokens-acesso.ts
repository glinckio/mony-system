import { createPublicKey } from 'node:crypto';

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { PapelUsuario } from '@mony/shared/enums';
import {
  type CryptoKey,
  errors,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
} from 'jose';

import { Clock } from '../clock/clock';
import { Configuracao } from '../config/configuracao';
import { ErroDominio } from '../erros/erro-dominio';

/** Token de acesso vale 15 minutos (RN-004). */
export const VALIDADE_ACESSO_SEGUNDOS = 15 * 60;

const ALGORITMO = 'ES256';
const EMISSOR = 'mony-api';
const AUDIENCIA = 'mony';

/** O que a API sabe de quem fez a requisição, tirado do token de acesso. */
export interface UsuarioAutenticado {
  id: string;
  papel: PapelUsuario;
  sessaoId: string;
  dispositivoId: string | null;
}

/**
 * Emite e confere os tokens de acesso: JWT ES256 de 15 minutos com `kid` (docs/arquitetura/11).
 * A hora vem do `Clock`, para os testes controlarem a expiração.
 */
@Injectable()
export class TokensAcesso implements OnModuleInit {
  private chavePrivada!: CryptoKey;
  private chavePublica!: CryptoKey;

  constructor(
    private readonly config: Configuracao,
    private readonly clock: Clock,
  ) {}

  private readonly log = new Logger(TokensAcesso.name);

  async onModuleInit(): Promise<void> {
    const pem = this.config.chavePrivadaJwt;
    if (pem === undefined) {
      // Só fora de produção (a configuração exige a chave em produção): tokens valem até reiniciar.
      const par = await generateKeyPair(ALGORITMO);
      this.chavePrivada = par.privateKey;
      this.chavePublica = par.publicKey;
      this.log.warn('JWT_CHAVE_PRIVADA não definida: usando uma chave temporária.');
      return;
    }
    this.chavePrivada = await importPKCS8(pem, ALGORITMO);
    // A chave pública sai da privada, então só existe um segredo para guardar.
    const spki = createPublicKey(pem).export({ type: 'spki', format: 'pem' }).toString();
    this.chavePublica = await importSPKI(spki, ALGORITMO);
  }

  async emitir(usuario: UsuarioAutenticado): Promise<{ token: string; expiraEm: Date }> {
    const agora = Math.floor(this.clock.agora().getTime() / 1000);
    const expiraEm = agora + VALIDADE_ACESSO_SEGUNDOS;
    const token = await new SignJWT({
      papel: usuario.papel,
      sid: usuario.sessaoId,
      ...(usuario.dispositivoId ? { did: usuario.dispositivoId } : {}),
    })
      .setProtectedHeader({ alg: ALGORITMO, kid: this.config.idChaveJwt, typ: 'JWT' })
      .setSubject(usuario.id)
      .setIssuer(EMISSOR)
      .setAudience(AUDIENCIA)
      .setIssuedAt(agora)
      .setExpirationTime(expiraEm)
      .sign(this.chavePrivada);
    return { token, expiraEm: new Date(expiraEm * 1000) };
  }

  /** Confere assinatura, emissor, audiência e validade. Lança `TOKEN_EXPIRADO` ou `NAO_AUTENTICADO`. */
  async verificar(token: string): Promise<UsuarioAutenticado> {
    try {
      const { payload } = await jwtVerify(token, this.chavePublica, {
        algorithms: [ALGORITMO],
        issuer: EMISSOR,
        audience: AUDIENCIA,
        currentDate: this.clock.agora(),
        requiredClaims: ['sub', 'exp', 'sid'],
      });
      const { sub, papel, sid, did } = payload;
      if (typeof sub !== 'string' || typeof sid !== 'string') throw new Error('claims');
      if (papel !== 'usuario' && papel !== 'admin') throw new Error('papel');
      return {
        id: sub,
        papel,
        sessaoId: sid,
        dispositivoId: typeof did === 'string' ? did : null,
      };
    } catch (erro) {
      if (erro instanceof errors.JWTExpired) throw new ErroDominio('TOKEN_EXPIRADO');
      throw new ErroDominio('NAO_AUTENTICADO');
    }
  }
}
