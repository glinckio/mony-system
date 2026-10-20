/**
 * Alertas e notificações (RN-100 a RN-105, doc 09): o contrato da central e das preferências e as
 * regras puras dos filtros do motor.
 */
import { z } from 'zod';

import { TIPOS_ALERTA, type TipoAlerta } from './enums.js';

/** RN-100: os de assinatura não podem ser desligados. */
export const TIPOS_ALERTA_OBRIGATORIOS: readonly TipoAlerta[] = ['assinatura'];

/** RN-103: tipos de consultoria, que dividem a cota diária. */
export const TIPOS_CONSULTORIA: readonly TipoAlerta[] = ['gasto_fora_padrao', 'projecao_mes'];

/** RN-103: até 3 alertas de consultoria por dia. */
export const COTA_CONSULTORIA_DIARIA = 3;

/** RN-101: com mais de 3 alertas adiados, o fim do silêncio manda um só, agrupado. */
export const MAXIMO_SEM_AGRUPAR = 3;

/**
 * Doc 09: categoria de ação do push, que o app registra com os botões. `fatura_atrasada` tem
 * [Paguei]; `lembrete` tem [Feito] e [Adiar]. Os outros tipos abrem só o `linkInterno`.
 */
export const CATEGORIAS_ACAO: Readonly<Partial<Record<TipoAlerta, string>>> = {
  fatura_atrasada: 'fatura_atrasada',
  lembrete: 'lembrete',
};

/**
 * Doc 04: canais de notificação do Android, criados pelo app. O canal `alarmes` é só dos alarmes
 * locais; o push usa os outros três.
 */
export const CANAIS_ANDROID = ['alertas', 'lembretes', 'alarmes', 'novidades'] as const;
export type CanalAndroid = (typeof CANAIS_ANDROID)[number];

/** O canal do Android de cada tipo de push: lembretes e novidades têm o seu; o resto é alerta. */
export function canalDoPush(tipo: TipoAlerta): CanalAndroid {
  if (tipo === 'lembrete') return 'lembretes';
  if (tipo === 'novidade') return 'novidades';
  return 'alertas';
}

/**
 * Doc 09: o push silencioso (sem título nem corpo) que pede ao app para buscar os alarmes de novo
 * (`GET /lembretes/alarmes`) quando muda um lembrete com alarme. Vai em `dados.tipo`.
 */
export const PUSH_SINCRONIZAR_ALARMES = 'sincronizar_alarmes';

/** Hora local `HH:MM`, de 00:00 a 23:59. */
export const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** RN-105: link interno do app, como `mony://cartoes/<id>/faturas/<id>` (doc 04). */
export const REGEX_LINK_INTERNO = /^mony:\/\/[a-z0-9-]+(\/[A-Za-z0-9-]+)*(\?[A-Za-z0-9=&_-]*)?$/;

/**
 * RN-101: a hora local está no horário de silêncio? A janela pode passar da meia-noite (22:00 às
 * 07:00); o início conta e o fim não. Início igual ao fim é sem silêncio.
 */
export function noSilencio(hora: string, inicio: string, fim: string): boolean {
  if (inicio === fim) return false;
  return inicio < fim ? hora >= inicio && hora < fim : hora >= inicio || hora < fim;
}

export const esquemaNotificacao = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_ALERTA),
  titulo: z.string(),
  corpo: z.string(),
  /** RN-105: abre a tela relacionada. */
  linkInterno: z.string(),
  criadoEm: z.iso.datetime(),
  /** Nulo enquanto espera o fim do horário de silêncio (RN-101). */
  enviadaEm: z.iso.datetime().nullable(),
  lidaEm: z.iso.datetime().nullable(),
});

export const esquemaPaginaNotificacoes = z.object({
  itens: z.array(esquemaNotificacao),
  proximoCursor: z.string().nullable(),
  naoLidas: z.number().int(),
});

/** Quantas novidades no ar o app mostra (T-150). */
export const MAXIMO_NOVIDADES_APP = 50;

/** Uma novidade no ar (T-150, doc 13), na aba Novidades da central. */
export const esquemaNovidade = z.object({
  id: z.uuid(),
  titulo: z.string(),
  descricao: z.string(),
  /** Link do YouTube ou do Vimeo. */
  videoUrl: z.string().nullable(),
  publicadaEm: z.string(),
  /** Lida, ou publicada antes de a conta existir. */
  lida: z.boolean(),
});

/** `GET /novidades`: as no ar, da mais nova para a mais antiga. */
export const esquemaNovidades = z.object({
  itens: z.array(esquemaNovidade),
  naoLidas: z.number().int(),
});

export const esquemaConsultaNotificacoes = z.object({
  tipo: z.enum(TIPOS_ALERTA).optional(),
  /** Só as não lidas. */
  naoLidas: z.stringbool().optional(),
  cursor: z.string().max(200).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(30),
});

/** T-085d: o aviso do compromisso sai tantos minutos antes, se a pessoa não escolher outro. */
export const ANTECEDENCIA_PADRAO_COMPROMISSO_MINUTOS = 30;
/** T-085d: no máximo um dia antes; `0` avisa na hora do começo. */
export const ANTECEDENCIA_MAXIMA_COMPROMISSO_MINUTOS = 24 * 60;

const esquemaSilencio = z
  .object({
    inicio: z.string().regex(REGEX_HORA, 'Hora no formato HH:MM'),
    fim: z.string().regex(REGEX_HORA, 'Hora no formato HH:MM'),
  })
  .refine(({ inicio, fim }) => inicio !== fim, { message: 'Início e fim diferentes' });

/** RN-100, RN-101 e RN-108: um item por tipo de alerta e o horário de silêncio. */
export const esquemaPreferenciasAlerta = z.object({
  /** Horário local do usuário; `null` sem silêncio. Vale para todos os tipos não urgentes. */
  silencio: z.object({ inicio: z.string(), fim: z.string() }).nullable(),
  tipos: z.array(
    z.object({
      tipo: z.enum(TIPOS_ALERTA),
      ativo: z.boolean(),
      /** Dias de antecedência dos avisos de vencimento (RN-108). */
      antecedenciaDias: z.number().int().nullable(),
      /** Minutos de antecedência do aviso do compromisso (T-085d); `null` usa o padrão (30). */
      antecedenciaMinutos: z.number().int().nullable(),
      /** RN-100: falso para os de assinatura. */
      desligavel: z.boolean(),
    }),
  ),
});

/** Só o que mudou. `silencio: null` tira o horário de silêncio. */
export const esquemaAtualizacaoPreferenciasAlerta = z.object({
  silencio: esquemaSilencio.nullable().optional(),
  tipos: z
    .array(
      z.object({
        tipo: z.enum(TIPOS_ALERTA),
        ativo: z.boolean().optional(),
        antecedenciaDias: z.number().int().min(0).max(30).nullable().optional(),
        antecedenciaMinutos: z
          .number()
          .int()
          .min(0)
          .max(ANTECEDENCIA_MAXIMA_COMPROMISSO_MINUTOS)
          .nullable()
          .optional(),
      }),
    )
    .max(TIPOS_ALERTA.length)
    .optional(),
});

export type Notificacao = z.infer<typeof esquemaNotificacao>;
export type Novidade = z.infer<typeof esquemaNovidade>;
export type Novidades = z.infer<typeof esquemaNovidades>;
export type PaginaNotificacoes = z.infer<typeof esquemaPaginaNotificacoes>;
export type ConsultaNotificacoes = z.infer<typeof esquemaConsultaNotificacoes>;
export type PreferenciasAlerta = z.infer<typeof esquemaPreferenciasAlerta>;
export type DadosAtualizacaoPreferenciasAlerta = z.infer<
  typeof esquemaAtualizacaoPreferenciasAlerta
>;
