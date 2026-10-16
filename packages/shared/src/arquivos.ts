/**
 * Contrato dos arquivos: o app pede uma URL assinada, envia direto para o S3 e depois liga o
 * arquivo ao recurso (ex.: `anexoIds` da transação). Doc 05 e doc 11.
 */
import { z } from 'zod';

import { TIPOS_ANEXO, type TipoAnexo } from './enums.js';

/** Tipos de arquivo aceitos: fotos e PDF (anexos) e áudio (mensagem de voz para a Mony, T-064). */
export const TIPOS_CONTEUDO_ANEXO = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/pdf',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
  'audio/webm',
] as const;

/** Tipos de conteúdo de cada tipo de arquivo: o áudio não vira anexo de lançamento, e vice-versa. */
export const CONTEUDOS_DO_TIPO: Record<
  TipoAnexo,
  readonly (typeof TIPOS_CONTEUDO_ANEXO)[number][]
> = {
  foto: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  pdf: ['application/pdf'],
  comprovante: ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'],
  audio: ['audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/webm'],
};

/** Doc 11: áudio de até 10 minutos. */
export const DURACAO_MAXIMA_AUDIO_SEGUNDOS = 10 * 60;

/** 10 MB: foto comprimida no aparelho (lado maior até ~2000 px, doc 04) ou áudio (doc 11). */
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;

/** 20 MB: PDF, como a fatura de vários meses (doc 11, T-144b). */
export const TAMANHO_MAXIMO_PDF = 20 * 1024 * 1024;

/** O tamanho máximo de um arquivo pelo tipo de conteúdo: PDF até 20 MB, o resto até 10 MB. */
export const tamanhoMaximoDoConteudo = (tipoConteudo: string): number =>
  tipoConteudo === 'application/pdf' ? TAMANHO_MAXIMO_PDF : TAMANHO_MAXIMO_ANEXO;

/** Validade das URLs assinadas (doc 11). */
export const VALIDADE_URL_ENVIO_SEGUNDOS = 5 * 60;
export const VALIDADE_URL_LEITURA_SEGUNDOS = 15 * 60;

export const esquemaNovoArquivo = z
  .object({
    tipo: z.enum(TIPOS_ANEXO),
    tipoConteudo: z.enum(TIPOS_CONTEUDO_ANEXO),
    /** Tamanho em bytes; conferido de novo quando o arquivo é ligado ao recurso. */
    tamanho: z.number().int().min(1).max(TAMANHO_MAXIMO_PDF),
  })
  .refine(({ tipo, tipoConteudo }) => CONTEUDOS_DO_TIPO[tipo].includes(tipoConteudo), {
    message: 'Tipo de conteúdo que não combina com o tipo do arquivo',
    path: ['tipoConteudo'],
  })
  .refine(({ tipoConteudo, tamanho }) => tamanho <= tamanhoMaximoDoConteudo(tipoConteudo), {
    message: 'Arquivo maior que o máximo do tipo (PDF até 20 MB, o resto até 10 MB)',
    path: ['tamanho'],
  });

export const esquemaEnvioArquivo = z.object({
  id: z.uuid(),
  metodo: z.literal('PUT'),
  url: z.string(),
  /** Cabeçalhos que o `PUT` precisa levar, como estão. */
  cabecalhos: z.record(z.string(), z.string()),
  expiraEm: z.iso.datetime(),
});

export const esquemaLeituraArquivo = z.object({
  id: z.uuid(),
  tipo: z.enum(TIPOS_ANEXO),
  tamanho: z.number().int(),
  url: z.string(),
  expiraEm: z.iso.datetime(),
});

export type DadosNovoArquivo = z.infer<typeof esquemaNovoArquivo>;
export type EnvioArquivo = z.infer<typeof esquemaEnvioArquivo>;
export type LeituraArquivo = z.infer<typeof esquemaLeituraArquivo>;
