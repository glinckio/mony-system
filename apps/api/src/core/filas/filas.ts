/** Filas BullMQ do doc 05. */
export const FILAS = {
  eventosDominio: 'eventos-dominio',
  notificacoes: 'notificacoes',
  monyMidia: 'mony-midia',
  openFinance: 'open-finance',
  webhooks: 'webhooks',
  relatorios: 'relatorios',
  lembretes: 'lembretes',
  agenda: 'agenda',
  rotinas: 'rotinas',
} as const;

export type NomeFila = (typeof FILAS)[keyof typeof FILAS];

/**
 * Id determinístico de job, para o mesmo trabalho não entrar duas vezes na fila (doc 05).
 * Junta as partes com `-`, porque o BullMQ recusa id com `:` e id só com dígitos.
 * Ex.: `idDeJob('fechar-fatura', faturaId)` → `fechar-fatura-<faturaId>`.
 */
export function idDeJob(...partes: (string | number)[]): string {
  if (partes.length === 0) throw new RangeError('idDeJob precisa de ao menos uma parte');
  const id = partes.map((parte) => String(parte).replaceAll(':', '-')).join('-');
  return /^\d+$/.test(id) ? `job-${id}` : id;
}
