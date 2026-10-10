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

export const esquemaAmbiente = z
  .object({
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
  });

export type Ambiente = z.infer<typeof esquemaAmbiente>;

export function validarAmbiente(variaveis: Record<string, unknown>): Ambiente {
  const resultado = esquemaAmbiente.safeParse(variaveis);
  if (!resultado.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}
