import { REGEX_VERSAO_APP } from '@mony/shared/config-app';
import { z } from 'zod';

/**
 * Variáveis de ambiente da API, validadas na subida (docs/arquitetura/02). Variável inválida
 * derruba o processo com uma mensagem clara, em vez de falhar depois em tempo de execução.
 * Em nuvem os valores vêm do Secrets Manager; localmente, de `apps/api/.env`.
 */
/** Em `.env`, `VARIAVEL=` (vazia) vale o mesmo que não definir a variável. */
function vazioComoAusente(valor: unknown): unknown {
  return typeof valor === 'string' && valor.trim() === '' ? undefined : valor;
}

/** `a, b,c` → `['a', 'b', 'c']`; ausente ou vazio → `[]`. */
const listaPorVirgula = z
  .string()
  .optional()
  .transform((valor) =>
    (valor ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  );

/**
 * Sentry (T-142c, doc 12). Lidas também antes do Nest subir (`core/sentry/sentry.ts`), porque o SDK
 * precisa iniciar antes dos outros módulos. Sem DSN, o Sentry fica desligado.
 */
export const camposSentry = {
  /** DSN do projeto: `api` na API e `worker` no worker. */
  SENTRY_DSN: z.preprocess(vazioComoAusente, z.url().optional()),
  /** Ambiente no Sentry (ex.: `staging`); sem ele, o `NODE_ENV`. */
  SENTRY_AMBIENTE: z.preprocess(vazioComoAusente, z.string().optional()),
  /** Release: o commit da imagem (`--build-arg SENTRY_RELEASE` no Dockerfile). */
  SENTRY_RELEASE: z.preprocess(vazioComoAusente, z.string().optional()),
};

export const esquemaSentry = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ...camposSentry,
});

export const esquemaAmbiente = z
  .object({
    ...camposSentry,
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'deve ser uma URL postgresql://usuario:senha@host:porta/banco'),
    REDIS_URL: z.string().regex(/^rediss?:\/\//, 'deve ser uma URL redis://host:porta'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /**
     * Chave privada ES256 (PKCS#8, PEM) que assina os tokens de acesso (docs/arquitetura/11).
     * Obrigatória em produção; fora dela, sem a chave, a API gera uma temporária na subida.
     * Em `.env`, as quebras de linha podem vir como `\n`.
     */
    JWT_CHAVE_PRIVADA: z
      .string()
      .optional()
      .transform((pem) =>
        pem === undefined || pem.trim() === '' ? undefined : pem.replaceAll('\\n', '\n'),
      ),
    /** Identificador da chave (`kid`), para trocar de chave sem derrubar as sessões. */
    JWT_ID_CHAVE: z.string().min(1).default('mony-1'),
    /**
     * Quem envia os e-mails transacionais (docs/arquitetura/10): `brevo` em nuvem; `smtp` em
     * desenvolvimento, com o Mailpit do `docker compose`; `fake` não envia nada (fora de produção
     * escreve o e-mail no log do worker).
     */
    EMAIL_PROVEDOR: z.enum(['fake', 'smtp', 'brevo']).default('fake'),
    BREVO_CHAVE_API: z.preprocess(vazioComoAusente, z.string().optional()),
    /** Servidor SMTP, ex.: `smtp://localhost:1025` (Mailpit). */
    SMTP_URL: z.preprocess(
      vazioComoAusente,
      z
        .string()
        .regex(/^smtps?:\/\//, 'deve ser uma URL smtp://host:porta')
        .optional(),
    ),
    /** Remetente dos e-mails. Com o Brevo, o domínio precisa estar verificado lá. */
    EMAIL_REMETENTE: z.preprocess(vazioComoAusente, z.email().optional()),
    /**
     * Push (docs/arquitetura/10): `expo` em nuvem; `fake` não envia (fora de produção escreve no
     * log do worker). `EXPO_ACCESS_TOKEN` só quando a segurança de push estiver ligada no EAS.
     */
    PUSH_PROVEDOR: z.enum(['fake', 'expo']).default('fake'),
    EXPO_ACCESS_TOKEN: z.preprocess(vazioComoAusente, z.string().optional()),
    /**
     * Modelo da Mony (doc 08): `anthropic` em nuvem, com `ANTHROPIC_CHAVE_API`; `fake` responde um
     * texto fixo, em pedaços, sem chamar ninguém (desenvolvimento e testes).
     */
    IA_PROVEDOR: z.enum(['fake', 'anthropic']).default('fake'),
    ANTHROPIC_CHAVE_API: z.preprocess(vazioComoAusente, z.string().optional()),
    IA_MODELO: z.string().min(1).default('claude-sonnet-5-5'),
    /**
     * Transcrição das mensagens de voz da Mony (doc 08, T-064): `deepgram` em nuvem, com
     * `DEEPGRAM_CHAVE_API`; `fake` devolve um texto fixo (desenvolvimento e testes).
     */
    TRANSCRICAO_PROVEDOR: z.enum(['fake', 'deepgram']).default('fake'),
    DEEPGRAM_CHAVE_API: z.preprocess(vazioComoAusente, z.string().optional()),
    TRANSCRICAO_MODELO: z.string().min(1).default('nova-3'),
    /**
     * Consulta do cupom fiscal pelo QR Code (doc 10, T-066a): `infosimples` em nuvem, com
     * `INFOSIMPLES_TOKEN`; `fake` devolve um cupom de exemplo (desenvolvimento e testes).
     */
    NFCE_PROVEDOR: z.enum(['fake', 'infosimples']).default('fake'),
    INFOSIMPLES_TOKEN: z.preprocess(vazioComoAusente, z.string().optional()),
    /**
     * Assinaturas (doc 10, T-102): `stripe`, com a chave secreta e o segredo do webhook; `fake` não
     * cobra ninguém (desenvolvimento e testes) e, em produção, responde 503.
     */
    COBRANCA_PROVEDOR: z.enum(['fake', 'stripe']).default('fake'),
    STRIPE_CHAVE_SECRETA: z.preprocess(vazioComoAusente, z.string().optional()),
    STRIPE_SEGREDO_WEBHOOK: z.preprocess(vazioComoAusente, z.string().optional()),
    /**
     * Endereço público da API, para onde a Stripe devolve a pessoa depois do checkout e do portal
     * (`/v1/assinatura/retorno`, que abre o app).
     */
    API_URL_PUBLICA: z.url().default('http://localhost:3000'),
    /**
     * Arquivos (anexos, áudios, exportações) no S3 privado, só por URL assinada (doc 11). Sem
     * bucket, o envio de arquivos fica desligado. `S3_ENDPOINT` só para S3 compatível local
     * (SeaweedFS do `docker compose`); na AWS fica vazio e as credenciais vêm do papel da tarefa.
     */
    S3_BUCKET: z.preprocess(vazioComoAusente, z.string().optional()),
    S3_ENDPOINT: z.preprocess(vazioComoAusente, z.url().optional()),
    AWS_REGION: z.string().min(1).default('sa-east-1'),
    /**
     * Versão mínima do app por plataforma (doc 04). Abaixo dela a API responde 426
     * `VERSAO_APP_DESATUALIZADA` e o app mostra a atualização obrigatória.
     */
    APP_VERSAO_MINIMA_IOS: z.string().regex(REGEX_VERSAO_APP, 'formato 1.2.3').default('0.0.0'),
    APP_VERSAO_MINIMA_ANDROID: z.string().regex(REGEX_VERSAO_APP, 'formato 1.2.3').default('0.0.0'),
    /**
     * Login social (RN-002): IDs de cliente OAuth aceitos como audiência do `id_token`, separados
     * por vírgula. Google: os do app iOS, do app Android e o web. Apple: o bundle id do app (e o
     * Services ID, se houver login pela web). Vazio desliga o provedor.
     */
    GOOGLE_CLIENT_IDS: listaPorVirgula,
    APPLE_CLIENT_IDS: listaPorVirgula,
    /**
     * Quem recebe os alertas técnicos do worker (T-142a, doc 12), separados por vírgula: fila
     * parada, falha em webhook, custo de IA do dia. Vazio: só o log `alerta_tecnico`.
     */
    ALERTAS_TECNICOS_EMAILS: listaPorVirgula.pipe(z.array(z.email()).max(10)),
    /** Namespace das métricas que o worker escreve no log para o CloudWatch (T-142d). */
    METRICAS_NAMESPACE: z.string().min(1).default('Mony/local'),
    /**
     * Chave mestra (32 bytes em base64) que cifra as chaves de dados dos tokens de terceiros
     * (agenda, T-085a; doc 11). Fora de produção, sem ela, vale uma chave fixa de desenvolvimento;
     * em produção, sem ela, nada é cifrado (a conexão da agenda responde 503). A KMS entra na T-085b.
     */
    CRIPTO_CHAVE_MESTRA: z.preprocess(
      vazioComoAusente,
      z
        .base64()
        .refine(
          (valor) => Buffer.from(valor, 'base64').length === 32,
          'deve ter 32 bytes em base64',
        )
        .optional(),
    ),
    /** Limite geral de requisições por IP por minuto (T-144a, doc 11); 0 desliga. */
    LIMITE_REQUISICOES_IP_MINUTO: z.coerce.number().int().min(0).max(1_000_000).default(1200),
  })
  .superRefine((variaveis, contexto) => {
    if (variaveis.NODE_ENV === 'production' && variaveis.JWT_CHAVE_PRIVADA === undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['JWT_CHAVE_PRIVADA'],
        message: 'obrigatória em produção (chave privada ES256 em PEM)',
      });
    }
    const exigidas = {
      fake: [],
      smtp: ['SMTP_URL'],
      brevo: ['BREVO_CHAVE_API', 'EMAIL_REMETENTE'],
    } as const;
    for (const nome of exigidas[variaveis.EMAIL_PROVEDOR]) {
      if (variaveis[nome] === undefined) {
        contexto.addIssue({
          code: 'custom',
          path: [nome],
          message: `obrigatória com EMAIL_PROVEDOR=${variaveis.EMAIL_PROVEDOR}`,
        });
      }
    }
    if (
      variaveis.TRANSCRICAO_PROVEDOR === 'deepgram' &&
      variaveis.DEEPGRAM_CHAVE_API === undefined
    ) {
      contexto.addIssue({
        code: 'custom',
        path: ['DEEPGRAM_CHAVE_API'],
        message: 'obrigatória com TRANSCRICAO_PROVEDOR=deepgram',
      });
    }
    if (variaveis.NFCE_PROVEDOR === 'infosimples' && variaveis.INFOSIMPLES_TOKEN === undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['INFOSIMPLES_TOKEN'],
        message: 'obrigatória com NFCE_PROVEDOR=infosimples',
      });
    }
    if (variaveis.COBRANCA_PROVEDOR === 'stripe') {
      for (const nome of ['STRIPE_CHAVE_SECRETA', 'STRIPE_SEGREDO_WEBHOOK'] as const) {
        if (variaveis[nome] === undefined) {
          contexto.addIssue({
            code: 'custom',
            path: [nome],
            message: 'obrigatória com COBRANCA_PROVEDOR=stripe',
          });
        }
      }
    }
    if (variaveis.IA_PROVEDOR === 'anthropic' && variaveis.ANTHROPIC_CHAVE_API === undefined) {
      contexto.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_CHAVE_API'],
        message: 'obrigatória com IA_PROVEDOR=anthropic',
      });
    }
  });

export type Ambiente = z.infer<typeof esquemaAmbiente>;

export function validarAmbiente(variaveis: Record<string, unknown>): Ambiente {
  const resultado = esquemaAmbiente.safeParse(variaveis);
  if (!resultado.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}
