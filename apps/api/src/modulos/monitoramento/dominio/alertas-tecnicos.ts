/**
 * Alertas técnicos do worker (T-142a, doc 12): para o responsável técnico, não para o usuário.
 * Aqui só a decisão (há alerta?) e o texto; a rotina lê as filas e o banco e não repete o aviso.
 */

/** Filas cujas falhas são de webhook: Stripe e o agregador de Open Finance (doc 12). */
export const FILAS_DE_WEBHOOK = ['webhooks', 'open-finance'] as const;

export interface AlertaTecnico {
  tipo: 'fila_parada' | 'falhas_webhook' | 'custo_ia';
  /** O que não se repete: a fila, ou o dia do custo. */
  chave: string;
  assunto: string;
  texto: string;
}

const MINUTO_MS = 60_000;

/**
 * Fila parada ou crescendo sem consumo: o job mais antigo esperando está lá há mais que o limite.
 * `esperaMs` é `null` quando não há nenhum esperando.
 */
export function alertaDeFilaParada(
  fila: string,
  esperaMs: number | null,
  aguardando: number,
  limiteMinutos: number,
): AlertaTecnico | null {
  if (esperaMs === null || esperaMs <= limiteMinutos * MINUTO_MS) return null;
  const minutos = Math.floor(esperaMs / MINUTO_MS);
  return {
    tipo: 'fila_parada',
    chave: fila,
    assunto: `Fila ${fila} parada`,
    texto:
      `A fila ${fila} tem ${String(aguardando)} job(s) esperando; o mais antigo está lá há ` +
      `${String(minutos)} minutos (limite: ${String(limiteMinutos)}). Confira se o worker está no ar.`,
  };
}

/**
 * Falha em webhook: a fila tem jobs que esgotaram as tentativas. Avisa de novo só quando o número
 * cresce desde o último aviso (`jaAvisados`), para não mandar o mesmo alerta a cada 5 minutos.
 */
export function alertaDeFalhasDeWebhook(
  fila: string,
  falhos: number,
  jaAvisados: number,
): AlertaTecnico | null {
  if (falhos <= 0 || falhos <= jaAvisados) return null;
  return {
    tipo: 'falhas_webhook',
    chave: fila,
    assunto: `Falha na fila ${fila}`,
    texto:
      `A fila ${fila} tem ${String(falhos)} job(s) que esgotaram as tentativas. ` +
      'Veja o motivo e reprocesse na seção Filas do painel.',
  };
}

/** Centavos de dólar em texto: 5000 → "US$ 50,00". */
export function dolares(centavos: number): string {
  const inteiros = Math.trunc(centavos / 100);
  const resto = Math.abs(centavos % 100);
  return `US$ ${inteiros.toLocaleString('pt-BR')},${String(resto).padStart(2, '0')}`;
}

/**
 * Custo de IA do dia (São Paulo) no limite do painel ou acima dele. `limiteCentavos` 0 desliga.
 * Um aviso por dia (`chave` é a data).
 */
export function alertaDoCustoIa(
  data: string,
  custoCentavos: number,
  limiteCentavos: number,
  modelosSemPreco: readonly string[],
): AlertaTecnico | null {
  if (limiteCentavos <= 0 || custoCentavos < limiteCentavos) return null;
  const semPreco =
    modelosSemPreco.length > 0
      ? ` Sem preço na tabela (fora da conta): ${modelosSemPreco.join(', ')}.`
      : '';
  return {
    tipo: 'custo_ia',
    chave: data,
    assunto: `Custo de IA de hoje passou de ${dolares(limiteCentavos)}`,
    texto:
      `O custo de IA de ${data} já é ${dolares(custoCentavos)}, acima do limite de ` +
      `${dolares(limiteCentavos)} do painel.${semPreco} Veja o custo por modelo na seção Mony.`,
  };
}
