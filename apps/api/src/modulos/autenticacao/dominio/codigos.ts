import { randomInt } from 'node:crypto';

import { DIGITOS_CODIGO_RECUPERACAO } from '@mony/shared/autenticacao';

/** RN-003: o código vale 15 minutos e aceita no máximo 5 tentativas erradas. */
export const VALIDADE_CODIGO_MINUTOS = 15;
export const MAXIMO_TENTATIVAS_CODIGO = 5;

/** Código de 6 dígitos com gerador criptográfico; pode começar com zero ("004217"). */
export function gerarCodigoRecuperacao(): string {
  return randomInt(0, 10 ** DIGITOS_CODIGO_RECUPERACAO)
    .toString()
    .padStart(DIGITOS_CODIGO_RECUPERACAO, '0');
}

export function somarMinutos(instante: Date, minutos: number): Date {
  return new Date(instante.getTime() + minutos * 60 * 1000);
}

export type SituacaoCodigo = 'vigente' | 'expirado';

/**
 * RN-003: o código deixa de valer quando foi usado, venceu ou esgotou as tentativas. Pedir um
 * código novo faz os anteriores vencerem na hora.
 */
export function situacaoCodigo(
  codigo: { usado: boolean; expiraEm: Date; tentativas: number },
  agora: Date,
): SituacaoCodigo {
  if (codigo.usado || codigo.expiraEm <= agora || codigo.tentativas >= MAXIMO_TENTATIVAS_CODIGO) {
    return 'expirado';
  }
  return 'vigente';
}
