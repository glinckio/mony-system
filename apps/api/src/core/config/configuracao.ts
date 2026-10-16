import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlataformaDispositivo } from '@mony/shared/enums';

import type { Ambiente } from './ambiente';

/** Acesso tipado às variáveis de ambiente já validadas. */
@Injectable()
export class Configuracao {
  constructor(private readonly config: ConfigService<Ambiente, true>) {}

  get ambiente(): Ambiente['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get ehProducao(): boolean {
    return this.ambiente === 'production';
  }

  get porta(): number {
    return this.config.get('PORT', { infer: true });
  }

  get urlBanco(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get urlRedis(): string {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get nivelLog(): Ambiente['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  /** Chave privada ES256 em PEM; `undefined` fora de produção quando não configurada. */
  get chavePrivadaJwt(): string | undefined {
    return this.config.get('JWT_CHAVE_PRIVADA', { infer: true });
  }

  get idChaveJwt(): string {
    return this.config.get('JWT_ID_CHAVE', { infer: true });
  }

  get provedorEmail(): Ambiente['EMAIL_PROVEDOR'] {
    return this.config.get('EMAIL_PROVEDOR', { infer: true });
  }

  /** Chave da API do Brevo; definida quando `provedorEmail` é `brevo`. */
  get chaveApiBrevo(): string | undefined {
    return this.config.get('BREVO_CHAVE_API', { infer: true });
  }

  /** Servidor SMTP; definido quando `provedorEmail` é `smtp`. */
  get urlSmtp(): string | undefined {
    return this.config.get('SMTP_URL', { infer: true });
  }

  get provedorIa(): Ambiente['IA_PROVEDOR'] {
    return this.config.get('IA_PROVEDOR', { infer: true });
  }

  /** Chave da API da Anthropic; obrigatória com `IA_PROVEDOR=anthropic`. */
  get chaveAnthropic(): string | undefined {
    return this.config.get('ANTHROPIC_CHAVE_API', { infer: true });
  }

  get modeloIa(): string {
    return this.config.get('IA_MODELO', { infer: true });
  }

  get provedorTranscricao(): Ambiente['TRANSCRICAO_PROVEDOR'] {
    return this.config.get('TRANSCRICAO_PROVEDOR', { infer: true });
  }

  /** Chave da API da Deepgram; obrigatória com `TRANSCRICAO_PROVEDOR=deepgram`. */
  get chaveDeepgram(): string | undefined {
    return this.config.get('DEEPGRAM_CHAVE_API', { infer: true });
  }

  get modeloTranscricao(): string {
    return this.config.get('TRANSCRICAO_MODELO', { infer: true });
  }

  get provedorNfce(): Ambiente['NFCE_PROVEDOR'] {
    return this.config.get('NFCE_PROVEDOR', { infer: true });
  }

  /** Token da API da Infosimples; obrigatório com `NFCE_PROVEDOR=infosimples`. */
  get tokenInfosimples(): string | undefined {
    return this.config.get('INFOSIMPLES_TOKEN', { infer: true });
  }

  get provedorCobranca(): Ambiente['COBRANCA_PROVEDOR'] {
    return this.config.get('COBRANCA_PROVEDOR', { infer: true });
  }

  /** Chave secreta da Stripe; obrigatória com `COBRANCA_PROVEDOR=stripe`. */
  get chaveSecretaStripe(): string | undefined {
    return this.config.get('STRIPE_CHAVE_SECRETA', { infer: true });
  }

  /** Segredo de assinatura do webhook da Stripe (`whsec_…`); obrigatório com a Stripe. */
  get segredoWebhookStripe(): string | undefined {
    return this.config.get('STRIPE_SEGREDO_WEBHOOK', { infer: true });
  }

  /** Endereço público da API, sem barra no fim. */
  get urlPublicaApi(): string {
    return this.config.get('API_URL_PUBLICA', { infer: true }).replace(/\/+$/, '');
  }

  get provedorPush(): Ambiente['PUSH_PROVEDOR'] {
    return this.config.get('PUSH_PROVEDOR', { infer: true });
  }

  /** Token de acesso do Expo, quando a segurança de push está ligada no EAS. */
  get tokenAcessoExpo(): string | undefined {
    return this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
  }

  /** Bucket dos arquivos; `undefined` desliga o envio de arquivos. */
  get bucketArquivos(): string | undefined {
    return this.config.get('S3_BUCKET', { infer: true });
  }

  /** Endereço de um S3 compatível (só local); `undefined` na AWS. */
  get enderecoS3(): string | undefined {
    return this.config.get('S3_ENDPOINT', { infer: true });
  }

  get regiaoAws(): string {
    return this.config.get('AWS_REGION', { infer: true });
  }

  /** Versão mínima do app em cada plataforma (`1.2.3`). */
  get versoesMinimasApp(): Record<PlataformaDispositivo, string> {
    return {
      ios: this.config.get('APP_VERSAO_MINIMA_IOS', { infer: true }),
      android: this.config.get('APP_VERSAO_MINIMA_ANDROID', { infer: true }),
    };
  }

  /** IDs de cliente OAuth aceitos no `id_token` do Google (vazio: login com Google desligado). */
  get clientesGoogle(): string[] {
    return this.config.get('GOOGLE_CLIENT_IDS', { infer: true });
  }

  /** Bundle id e Services ID aceitos no `id_token` da Apple (vazio: desligado). */
  get clientesApple(): string[] {
    return this.config.get('APPLE_CLIENT_IDS', { infer: true });
  }

  /** Quem recebe os alertas técnicos (T-142a); vazio, só o log. */
  get emailsAlertasTecnicos(): string[] {
    return this.config.get('ALERTAS_TECNICOS_EMAILS', { infer: true });
  }

  /** Namespace das métricas no CloudWatch (T-142d), ex.: `Mony/staging`. */
  get namespaceMetricas(): string {
    return this.config.get('METRICAS_NAMESPACE', { infer: true });
  }

  /** Remetente dos e-mails; obrigatório quando `provedorEmail` é `brevo`. */
  get remetenteEmail(): string | undefined {
    return this.config.get('EMAIL_REMETENTE', { infer: true });
  }
}
