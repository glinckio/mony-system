/**
 * Apps de compra (T-121a, RN-104, RN-121): a lista de apps monitorados, o token de evento do
 * aparelho e a abertura que o aparelho manda ao servidor.
 *
 * O app não lê nada dos outros apps: só sabe que um app da lista foi aberto (doc 10). No Android o
 * identificador é o pacote (`com.shopee.br`); no iOS, o token opaco do Screen Time (T-121c).
 */
import { z } from 'zod';

export const MAXIMO_APPS_MONITORADOS = 50;
/** Prefixo do token de evento, para não ser confundido com o token de acesso. */
export const PREFIXO_TOKEN_EVENTO = 'mte_';
/**
 * Aberturas mais antigas que isso (o aparelho ficou sem rede) não viram alerta: o aviso só faz
 * sentido na hora da compra.
 */
export const IDADE_MAXIMA_ABERTURA_MINUTOS = 60;

export const esquemaAppMonitorado = z.object({
  identificadorApp: z.string(),
  nome: z.string(),
  ativo: z.boolean(),
  /** O último alerta mandado para este app (RN-104). */
  ultimoAlerta: z.iso.datetime().nullable(),
});

export const esquemaListaAppsMonitorados = z.object({
  itens: z.array(esquemaAppMonitorado),
  /** RN-121: o recurso é do plano pago e do teste; no gratuito, a lista fica guardada. */
  disponivel: z.boolean(),
});

/**
 * `PUT /apps-monitorados`: a lista inteira. O que não vier sai; o que vier com `ativo: false`
 * fica na lista, sem alerta.
 */
export const esquemaAtualizacaoAppsMonitorados = z.object({
  itens: z
    .array(
      z.object({
        identificadorApp: z.string().trim().min(1).max(500),
        nome: z.string().trim().min(1).max(80),
        ativo: z.boolean(),
      }),
    )
    .max(MAXIMO_APPS_MONITORADOS)
    .refine(
      (itens) =>
        new Set(itens.map(({ identificadorApp }) => identificadorApp)).size === itens.length,
      { message: 'App repetido.' },
    ),
});

/**
 * `POST /apps-monitorados/token-evento`: o token do aparelho desta sessão, mostrado uma vez só.
 * Pedir de novo troca o token. O app guarda no armazenamento nativo cifrado.
 */
export const esquemaTokenEvento = z.object({ token: z.string() });

/** `POST /eventos/app-compra-aberto`, com `Authorization: Bearer <token de evento>`. */
export const esquemaAberturaAppCompra = z.object({
  identificadorApp: z.string().trim().min(1).max(500),
  abertoEm: z.iso.datetime({ offset: true }),
});

export const MOTIVOS_SEM_ALERTA_APP = [
  'nao_monitorado',
  'intervalo',
  'antigo',
  'desligado',
  'silencio',
] as const;
export type MotivoSemAlertaApp = (typeof MOTIVOS_SEM_ALERTA_APP)[number];

/**
 * A resposta da abertura: `alertado` quando o push saiu. Sem alerta, o motivo: app fora da lista
 * ou desligado nela, dentro do intervalo da RN-104, abertura antiga, alerta desligado pela pessoa
 * (RN-100) ou horário de silêncio (RN-101).
 */
export const esquemaResultadoAberturaApp = z.object({
  alertado: z.boolean(),
  motivo: z.enum(MOTIVOS_SEM_ALERTA_APP).nullable(),
});

export type AppMonitorado = z.infer<typeof esquemaAppMonitorado>;
export type ListaAppsMonitorados = z.infer<typeof esquemaListaAppsMonitorados>;
export type DadosAtualizacaoAppsMonitorados = z.infer<typeof esquemaAtualizacaoAppsMonitorados>;
export type TokenEvento = z.infer<typeof esquemaTokenEvento>;
export type DadosAberturaAppCompra = z.infer<typeof esquemaAberturaAppCompra>;
export type ResultadoAberturaApp = z.infer<typeof esquemaResultadoAberturaApp>;
