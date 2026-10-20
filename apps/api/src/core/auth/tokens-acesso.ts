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
/** O desafio do admin (senha certa, falta o 2FA) vale 5 minutos (docs/arquitetura/11). */
export const VALIDADE_DESAFIO_ADMIN_SEGUNDOS = 5 * 60;
/** A sessão do admin renova de 15 em 15 minutos, até 8 horas depois do login com 2FA. */
export const DURACAO_MAXIMA_SESSAO_ADMIN_SEGUNDOS = 8 * 60 * 60;
/** O token de segundo plano do aparelho (T-088b) vale até 30 dias, nunca além da sessão. */
export const VALIDADE_SEGUNDO_PLANO_SEGUNDOS = 30 * 24 * 60 * 60;

const ALGORITMO = 'ES256';
const EMISSOR = 'mony-api';
const AUDIENCIA = 'mony';
/** Token do painel: outra audiência, para o do app não abrir o admin, nem o contrário. */
const AUDIENCIA_ADMIN = 'mony-admin';
const AUDIENCIA_DESAFIO_ADMIN = 'mony-admin-2fa';
/** Token de segundo plano: outra audiência, para ele não abrir as rotas comuns do app. */
const AUDIENCIA_SEGUNDO_PLANO = 'mony-segundo-plano';

/** O que a API sabe de quem fez a requisição, tirado do token de acesso. */
export interface UsuarioAutenticado {
  id: string;
  papel: PapelUsuario;
  sessaoId: string;
  dispositivoId: string | null;
  /**
   * `admin`: token do painel, emitido depois da senha e do 2FA, com a hora do login (`auth_time`,
   * em segundos). `segundo-plano`: token da tarefa que trata o push com o app fechado (T-088b),
   * só para as rotas com `@SegundoPlano()`. Sem o campo, é token do app.
   */
  escopo?: 'admin' | 'segundo-plano';
  autenticadoEm?: number;
  /**
   * Só no token de segundo plano: a família da sessão (RN-004). A sessão do `sessaoId` gira a cada
   * renovação do app; a família continua a mesma até sair, sair de todos ou o reuso derrubá-la.
   */
  familiaId?: string;
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

  /**
   * Token do painel admin (T-104a): só depois da senha e do 2FA. `autenticadoEm` (segundos) é a
   * hora do login e segue igual nas renovações, que param 8 horas depois dela.
   */
  async emitirAdmin(
    usuarioId: string,
    sessaoId: string,
    autenticadoEm: number,
  ): Promise<{ token: string; expiraEm: Date }> {
    const agora = Math.floor(this.clock.agora().getTime() / 1000);
    const expiraEm = Math.min(
      agora + VALIDADE_ACESSO_SEGUNDOS,
      autenticadoEm + DURACAO_MAXIMA_SESSAO_ADMIN_SEGUNDOS,
    );
    const token = await this.assinar(
      { papel: 'admin', sid: sessaoId, auth_time: autenticadoEm },
      usuarioId,
      AUDIENCIA_ADMIN,
      agora,
      expiraEm,
    );
    return { token, expiraEm: new Date(expiraEm * 1000) };
  }

  /**
   * Token de segundo plano do aparelho (T-088b): o mesmo usuário, sessão e aparelho do token do
   * app, mais a família da sessão, com outra audiência. Vale 30 dias ou até `limite` (o fim da
   * sessão), o que vier antes.
   */
  async emitirSegundoPlano(
    usuario: { id: string; sessaoId: string; dispositivoId: string; familiaId: string },
    limite: Date,
  ): Promise<{ token: string; expiraEm: Date }> {
    const agora = Math.floor(this.clock.agora().getTime() / 1000);
    const expiraEm = Math.min(
      agora + VALIDADE_SEGUNDO_PLANO_SEGUNDOS,
      Math.floor(limite.getTime() / 1000),
    );
    const token = await this.assinar(
      {
        papel: 'usuario',
        sid: usuario.sessaoId,
        did: usuario.dispositivoId,
        fam: usuario.familiaId,
      },
      usuario.id,
      AUDIENCIA_SEGUNDO_PLANO,
      agora,
      expiraEm,
    );
    return { token, expiraEm: new Date(expiraEm * 1000) };
  }

  /** O desafio do 2FA: prova que a senha de um admin estava certa, por 5 minutos. */
  async emitirDesafioAdmin(usuarioId: string): Promise<{ token: string; expiraEm: Date }> {
    const agora = Math.floor(this.clock.agora().getTime() / 1000);
    const expiraEm = agora + VALIDADE_DESAFIO_ADMIN_SEGUNDOS;
    const token = await this.assinar({}, usuarioId, AUDIENCIA_DESAFIO_ADMIN, agora, expiraEm);
    return { token, expiraEm: new Date(expiraEm * 1000) };
  }

  /** O id do admin do desafio. Lança `SESSAO_INVALIDA` se não é um desafio válido. */
  async verificarDesafioAdmin(token: string): Promise<string> {
    try {
      const { payload } = await jwtVerify(token, this.chavePublica, {
        algorithms: [ALGORITMO],
        issuer: EMISSOR,
        audience: AUDIENCIA_DESAFIO_ADMIN,
        currentDate: this.clock.agora(),
        requiredClaims: ['sub', 'exp'],
      });
      if (typeof payload.sub !== 'string') throw new Error('claims');
      return payload.sub;
    } catch {
      throw new ErroDominio('SESSAO_INVALIDA');
    }
  }

  private assinar(
    claims: Record<string, unknown>,
    assunto: string,
    audiencia: string,
    agora: number,
    expiraEm: number,
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: ALGORITMO, kid: this.config.idChaveJwt, typ: 'JWT' })
      .setSubject(assunto)
      .setIssuer(EMISSOR)
      .setAudience(audiencia)
      .setIssuedAt(agora)
      .setExpirationTime(expiraEm)
      .sign(this.chavePrivada);
  }

  /**
   * Confere assinatura, emissor, audiência (app, painel ou segundo plano) e validade. Lança
   * `TOKEN_EXPIRADO` ou `NAO_AUTENTICADO`. O desafio do 2FA não passa aqui: a audiência dele é
   * outra. O token de segundo plano ainda passa pela guarda, que confere a sessão no banco.
   */
  async verificar(token: string): Promise<UsuarioAutenticado> {
    try {
      const { payload } = await jwtVerify(token, this.chavePublica, {
        algorithms: [ALGORITMO],
        issuer: EMISSOR,
        audience: [AUDIENCIA, AUDIENCIA_ADMIN, AUDIENCIA_SEGUNDO_PLANO],
        currentDate: this.clock.agora(),
        requiredClaims: ['sub', 'exp', 'sid'],
      });
      const { sub, papel, sid, did, fam, aud, auth_time: autenticadoEm } = payload;
      if (typeof sub !== 'string' || typeof sid !== 'string') throw new Error('claims');
      if (papel !== 'usuario' && papel !== 'admin') throw new Error('papel');
      const usuario: UsuarioAutenticado = {
        id: sub,
        papel,
        sessaoId: sid,
        dispositivoId: typeof did === 'string' ? did : null,
      };
      const audiencias = Array.isArray(aud) ? aud : [aud];
      if (audiencias.includes(AUDIENCIA_ADMIN)) {
        if (papel !== 'admin' || typeof autenticadoEm !== 'number') throw new Error('admin');
        return { ...usuario, escopo: 'admin', autenticadoEm };
      }
      if (audiencias.includes(AUDIENCIA_SEGUNDO_PLANO)) {
        if (papel !== 'usuario' || usuario.dispositivoId === null || typeof fam !== 'string') {
          throw new Error('segundo plano');
        }
        return { ...usuario, escopo: 'segundo-plano', familiaId: fam };
      }
      return usuario;
    } catch (erro) {
      if (erro instanceof errors.JWTExpired) throw new ErroDominio('TOKEN_EXPIRADO');
      throw new ErroDominio('NAO_AUTENTICADO');
    }
  }
}
