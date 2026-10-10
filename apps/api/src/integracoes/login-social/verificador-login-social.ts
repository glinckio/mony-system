import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { normalizarEmail } from '@mony/shared/autenticacao';
import type { ProvedorLoginSocial } from '@mony/shared/enums';
import { errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';

/** Quem o usuário é para o Google ou a Apple, já com a assinatura e as datas conferidas. */
export interface IdentidadeSocial {
  provedor: ProvedorLoginSocial;
  /** `sub` do token: o identificador estável da pessoa no provedor. */
  idExterno: string;
  /** Em minúsculas; `null` quando o provedor não mandou. */
  email: string | null;
  emailVerificado: boolean;
  nome: string | null;
  nonce: string | null;
  expiraEm: Date;
}

export interface ConfigProvedorSocial {
  /** Valores aceitos em `iss`. */
  emissores: string[];
  /** IDs de cliente aceitos em `aud`. Vazio: provedor desligado. */
  audiencias: string[];
  /** Chaves públicas do provedor (JWKS remoto em produção, local nos testes). */
  chaves: JWTVerifyGetKey;
}

export type ConfigLoginSocial = Record<ProvedorLoginSocial, ConfigProvedorSocial>;

/** Token da configuração; os testes trocam as chaves por um JWKS local. */
export const CONFIG_LOGIN_SOCIAL = Symbol('CONFIG_LOGIN_SOCIAL');

export const EMISSORES_LOGIN_SOCIAL: Record<ProvedorLoginSocial, string[]> = {
  google: ['https://accounts.google.com', 'accounts.google.com'],
  apple: ['https://appleid.apple.com'],
};

export const URLS_CHAVES_LOGIN_SOCIAL: Record<ProvedorLoginSocial, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
  apple: 'https://appleid.apple.com/auth/keys',
};

/** Nome do provedor nas mensagens: "com o Google", "conta da Apple". */
export const NOMES_PROVEDORES: Record<ProvedorLoginSocial, { o: string; do: string }> = {
  google: { o: 'o Google', do: 'do Google' },
  apple: { o: 'a Apple', do: 'da Apple' },
};

/** Diferença de relógio aceita entre nós e o provedor. */
const TOLERANCIA_RELOGIO_SEGUNDOS = 60;

/**
 * Confere o `id_token` do Google ou da Apple no servidor (docs/arquitetura/11): assinatura pelas
 * chaves públicas do provedor, algoritmo RS256, emissor, audiência (nossos IDs de cliente) e
 * validade. O `nonce` é conferido por `nonceConfere`, porque depende do que o app mandou.
 */
@Injectable()
export class VerificadorLoginSocial {
  constructor(
    @Inject(CONFIG_LOGIN_SOCIAL) private readonly config: ConfigLoginSocial,
    private readonly clock: Clock,
  ) {}

  async verificar(provedor: ProvedorLoginSocial, idToken: string): Promise<IdentidadeSocial> {
    const { emissores, audiencias, chaves } = this.config[provedor];
    const nome = NOMES_PROVEDORES[provedor].o;
    if (audiencias.length === 0) {
      throw new ErroDominio('SERVICO_INDISPONIVEL', {
        mensagem: `O login com ${nome} ainda não está disponível.`,
      });
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, chaves, {
        issuer: emissores,
        audience: audiencias,
        algorithms: ['RS256'],
        currentDate: this.clock.agora(),
        clockTolerance: TOLERANCIA_RELOGIO_SEGUNDOS,
        requiredClaims: ['sub', 'exp', 'iat'],
      }));
    } catch (erro) {
      // Sem resposta do provedor (chaves fora do ar) é indisponibilidade, não token ruim.
      if (erro instanceof errors.JWKSTimeout || !(erro instanceof errors.JOSEError)) {
        throw new ErroDominio('SERVICO_INDISPONIVEL', {
          mensagem: `Não conseguimos falar com ${nome} agora. Tente de novo em instantes.`,
        });
      }
      throw new ErroDominio('CREDENCIAIS_INVALIDAS', {
        mensagem: `Não conseguimos confirmar seu login com ${nome}. Tente de novo.`,
      });
    }

    return {
      provedor,
      idExterno: String(payload.sub),
      email: typeof payload.email === 'string' ? normalizarEmail(payload.email) : null,
      // A Apple manda `email_verified` como texto ("true"); o Google, como booleano.
      emailVerificado: payload.email_verified === true || payload.email_verified === 'true',
      nome: typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name : null,
      nonce: typeof payload.nonce === 'string' ? payload.nonce : null,
      expiraEm: new Date((payload.exp ?? 0) * 1000),
    };
  }
}

/**
 * Confere o `nonce` do token com o que o app mandou. A Apple devolve o resumo SHA-256 (hex) do
 * valor que o app gerou; o Google devolve o valor como veio. Com a Apple o nonce é obrigatório;
 * com o Google, só quando o token traz um.
 */
export function nonceConfere(
  identidade: Pick<IdentidadeSocial, 'provedor' | 'nonce'>,
  enviado: string | undefined,
): boolean {
  if (identidade.nonce === null) return identidade.provedor === 'google';
  if (enviado === undefined) return false;
  const resumo = createHash('sha256').update(enviado).digest('hex');
  return identidade.nonce === enviado || identidade.nonce === resumo;
}
