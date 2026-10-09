/**
 * Dinheiro no Mony é sempre um número inteiro de centavos (docs/arquitetura/03).
 * Nenhuma função aqui passa por número com casas decimais: formatar e ler texto usam só
 * aritmética inteira, então o resultado é exato em toda a faixa de inteiros seguros
 * (até ± R$ 90 trilhões).
 */

/** Espaço não separável, o mesmo que o `Intl.NumberFormat` usa entre "R$" e o número. */
const ESPACO_FIXO = ' ';

/** Diz se o valor é um inteiro de centavos válido (inteiro seguro do JavaScript). */
export function ehCentavos(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor);
}

function garantirCentavos(valor: number, nome: string): void {
  if (!ehCentavos(valor)) {
    throw new RangeError(`${nome} deve ser um inteiro de centavos; recebido ${String(valor)}`);
  }
}

/** Troca `-0` por `0`, para nunca devolver "zero negativo". */
function semZeroNegativo(valor: number): number {
  return valor === 0 ? 0 : valor;
}

export interface OpcoesFormatacao {
  /** Mostra o símbolo "R$" antes do número. Padrão: `true`. */
  simbolo?: boolean;
}

/**
 * Formata centavos para exibição em pt-BR: `123456` → `"R$ 1.234,56"`, `-1050` → `"-R$ 10,50"`.
 * A saída é idêntica à de `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`,
 * inclusive o espaço não separável depois de "R$".
 */
export function formatarCentavos(valorCentavos: number, opcoes: OpcoesFormatacao = {}): string {
  garantirCentavos(valorCentavos, 'valorCentavos');
  const { simbolo = true } = opcoes;
  const absoluto = Math.abs(valorCentavos);
  const centavos = absoluto % 100;
  const reais = (absoluto - centavos) / 100;
  const reaisComPontos = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const numero = `${reaisComPontos},${String(centavos).padStart(2, '0')}`;
  const sinal = valorCentavos < 0 ? '-' : '';
  return simbolo ? `${sinal}R$${ESPACO_FIXO}${numero}` : `${sinal}${numero}`;
}

const PADRAO_VALOR = /^(-?)\s*(?:R\$\s*)?(-?)\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * Lê um valor digitado em pt-BR e devolve centavos, ou `null` se o texto não for um valor válido.
 *
 * Aceita `"10"`, `"10,5"`, `"1.234,56"`, `"R$ 1.234,56"`, `"-R$ 10,50"`. Recusa mais de duas
 * casas decimais e ponto como separador decimal (`"10.50"` é ambíguo em pt-BR).
 */
export function textoParaCentavos(texto: string): number | null {
  const limpo = texto.replaceAll(ESPACO_FIXO, ' ').trim();
  const partes = PADRAO_VALOR.exec(limpo);
  if (!partes) return null;
  const [, sinalAntes = '', sinalDepois = '', reaisTexto = '', centavosTexto = ''] = partes;
  if (sinalAntes !== '' && sinalDepois !== '') return null;
  const total = Number(reaisTexto.replaceAll('.', '')) * 100 + Number(centavosTexto.padEnd(2, '0'));
  if (!Number.isSafeInteger(total)) return null;
  const negativo = sinalAntes !== '' || sinalDepois !== '';
  return semZeroNegativo(negativo ? -total : total);
}

/** Soma valores em centavos. Lança `RangeError` se algum não for inteiro ou se a soma estourar. */
export function somarCentavos(valores: readonly number[]): number {
  let total = 0;
  valores.forEach((valor, indice) => {
    garantirCentavos(valor, `valores[${String(indice)}]`);
    total += valor;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError('A soma passou do maior inteiro de centavos seguro');
    }
  });
  return total;
}

export interface OpcoesDivisao {
  /**
   * Parte que recebe os centavos que sobram da divisão.
   * Padrão: `'primeira'`, como nas parcelas sem juros (RN-051).
   */
  restoNa?: 'primeira' | 'ultima';
}

/**
 * Divide um valor em partes inteiras sem perder centavo: a soma das partes é sempre igual ao total.
 * Cada parte recebe `floor(|total| / partes)` e o resto vai inteiro para a primeira parte
 * (ou para a última, com `restoNa: 'ultima'`). Ex.: `dividirCentavos(1000, 3)` → `[334, 333, 333]`.
 */
export function dividirCentavos(
  totalCentavos: number,
  partes: number,
  opcoes: OpcoesDivisao = {},
): number[] {
  garantirCentavos(totalCentavos, 'totalCentavos');
  if (!Number.isSafeInteger(partes) || partes < 1) {
    throw new RangeError(`partes deve ser um inteiro maior que zero; recebido ${String(partes)}`);
  }
  const { restoNa = 'primeira' } = opcoes;
  const sinal = totalCentavos < 0 ? -1 : 1;
  const absoluto = Math.abs(totalCentavos);
  const resto = absoluto % partes;
  const base = (absoluto - resto) / partes;
  const valores = Array.from({ length: partes }, () => semZeroNegativo(base * sinal));
  valores[restoNa === 'primeira' ? 0 : partes - 1] = semZeroNegativo((base + resto) * sinal);
  return valores;
}
