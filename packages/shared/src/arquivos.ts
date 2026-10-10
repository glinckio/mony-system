/**
 * Contrato dos arquivos: o app pede uma URL assinada, envia direto para o S3 e depois liga o
 * arquivo ao recurso (ex.: `anexoIds` da transação). Doc 05 e doc 11.
 */
import { z } from 'zod';

import { TIPOS_ANEXO } from './enums.js';

/** Tipos de arquivo aceitos como anexo: fotos e PDF. */
export const TIPOS_CONTEUDO_ANEXO = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/pdf',
] as const;

/** 10 MB: foto comprimida no aparelho (lado maior até ~2000 px, doc 04) ou PDF de comprovante. */
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;

/** Validade das URLs assinadas (doc 11). */
export const VALIDADE_URL_ENVIO_SEGUNDOS = 5 * 60;
export const VALIDADE_URL_LEITURA_SEGUNDOS = 15 * 60;

export const esquemaNovoArquivo = z.object({
  tipo: z.enum(TIPOS_ANEXO),
  tipoConteudo: z.enum(TIPOS_CONTEUDO_ANEXO),
  /** Tamanho em bytes; conferido de novo quando o arquivo é ligado ao recurso. */
  tamanho: z.number().int().min(1).max(TAMANHO_MAXIMO_ANEXO),
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
