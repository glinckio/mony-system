/** Quantos bytes do começo do arquivo bastam para reconhecer o tipo. */
export const BYTES_PARA_TIPO = 64;

/** O tipo de conteúdo que os primeiros bytes revelam, entre os que o envio aceita. */
export type TipoConteudoReal =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'application/pdf'
  | 'audio/mp4'
  | 'audio/aac'
  | 'audio/mpeg'
  | 'audio/webm';

/** Imagem, PDF ou áudio: o declarado e o real precisam cair no mesmo grupo. */
const grupo = (tipoConteudo: string): string => tipoConteudo.split('/')[0] ?? '';

/** Marcas do `ftyp` de HEIC/HEIF (fotos do iPhone). */
const MARCAS_HEIC = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

const comeca = (bytes: Uint8Array, assinatura: readonly number[], inicio = 0): boolean =>
  assinatura.every((byte, i) => bytes[inicio + i] === byte);

const texto = (bytes: Uint8Array, inicio: number, fim: number): string =>
  String.fromCharCode(...bytes.subarray(inicio, fim));

/**
 * Doc 11 (T-144b): o tipo pelo conteúdo, não pelo que o app declarou. Reconhece só os tipos que o
 * envio aceita; o resto é `null`.
 */
export function tipoPelosBytes(bytes: Uint8Array): TipoConteudoReal | null {
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (texto(bytes, 0, 4) === 'RIFF' && texto(bytes, 8, 12) === 'WEBP') return 'image/webp';
  if (texto(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  if (comeca(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm';
  if (texto(bytes, 4, 8) === 'ftyp') {
    return MARCAS_HEIC.has(texto(bytes, 8, 12)) ? 'image/heic' : 'audio/mp4';
  }
  if (texto(bytes, 0, 3) === 'ID3') return 'audio/mpeg';
  // Quadro de áudio sem cabeçalho: 11 bits de sincronia. No ADTS (AAC) a camada é 00; no MPEG
  // áudio (MP3), não.
  const segundo = bytes[1] ?? 0;
  if (bytes[0] === 0xff && (segundo & 0xe0) === 0xe0) {
    return (segundo & 0xf6) === 0xf0 ? 'audio/aac' : 'audio/mpeg';
  }
  return null;
}

/**
 * O tipo real do arquivo quando ele combina com o declarado no envio (o mesmo grupo: imagem, PDF
 * ou áudio, já que o aparelho às vezes declara JPEG para um PNG); `null` quando não combina.
 */
export function tipoRealConferido(
  tipoDeclarado: string,
  bytes: Uint8Array,
): TipoConteudoReal | null {
  const real = tipoPelosBytes(bytes);
  if (real === null) return null;
  if (real === 'application/pdf' || tipoDeclarado === 'application/pdf') {
    return real === tipoDeclarado ? real : null;
  }
  return grupo(real) === grupo(tipoDeclarado) ? real : null;
}
