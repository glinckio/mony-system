import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Código de uso único por tempo (TOTP, RFC 6238) do 2FA do painel admin (docs/arquitetura/11):
 * HMAC-SHA1, passos de 30 s e 6 dígitos, o padrão que Google Authenticator, Authy e 1Password leem.
 */
export const PASSO_TOTP_SEGUNDOS = 30;
const DIGITOS = 6;
/** Aceita o passo anterior e o seguinte, para relógio de celular um pouco adiantado ou atrasado. */
const TOLERANCIA_PASSOS = 1;
const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 sem `=` (RFC 4648), como o segredo vai no QR Code e para digitar no aplicativo. */
export function paraBase32(bytes: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32.charAt((valor >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32.charAt((valor << (5 - bits)) & 31);
  return saida;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const letra of limpo) {
    const indice = ALFABETO_BASE32.indexOf(letra);
    if (indice < 0) throw new Error('Segredo TOTP fora do base32');
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo novo: 20 bytes aleatórios (160 bits, o tamanho do HMAC-SHA1), em base32. */
export function gerarSegredoTotp(): string {
  return paraBase32(randomBytes(20));
}

/** O passo de 30 s de um instante (o "contador" do RFC 6238). */
export function passoTotp(instante: Date): number {
  return Math.floor(instante.getTime() / 1000 / PASSO_TOTP_SEGUNDOS);
}

/** O código de um passo (RFC 4226, truncamento dinâmico). */
export function codigoTotp(segredo: string, passo: number, digitos = DIGITOS): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const deslocamento = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const numero = hmac.readUInt32BE(deslocamento) & 0x7fffffff;
  return String(numero % 10 ** digitos).padStart(digitos, '0');
}

/**
 * Confere o código digitado no instante, com a tolerância de um passo para cada lado. Devolve o
 * passo que bateu (para impedir que o mesmo código seja usado de novo) ou `null`.
 */
export function conferirTotp(segredo: string, codigo: string, instante: Date): number | null {
  const digitado = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digitado)) return null;
  const atual = passoTotp(instante);
  for (let desvio = -TOLERANCIA_PASSOS; desvio <= TOLERANCIA_PASSOS; desvio += 1) {
    const esperado = codigoTotp(segredo, atual + desvio);
    if (timingSafeEqual(Buffer.from(esperado), Buffer.from(digitado))) return atual + desvio;
  }
  return null;
}

/** O endereço `otpauth://` que o QR Code leva: o app autenticador mostra "Monitorizze (e-mail)". */
export function enderecoTotp(segredo: string, conta: string, emissor = 'Monitorizze'): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const parametros = new URLSearchParams({
    secret: segredo,
    issuer: emissor,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(PASSO_TOTP_SEGUNDOS),
  });
  return `otpauth://totp/${rotulo}?${parametros.toString()}`;
}
