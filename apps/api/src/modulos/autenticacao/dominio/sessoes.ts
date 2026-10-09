import { createHash, randomBytes } from 'node:crypto';

import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { DOCUMENTOS_ACEITE, type DocumentoAceite } from '@mony/shared/enums';

/** Token de renovação vale 60 dias sem uso; cada renovação começa a contagem de novo. */
export const VALIDADE_RENOVACAO_DIAS = 60;
/** RN-006: o cadastro dá 3 dias de teste com acesso completo. */
export const DURACAO_TESTE_DIAS = 3;
/** RN-008: 5 tentativas por e-mail e 20 por IP a cada 15 minutos. */
export const JANELA_TENTATIVAS_SEGUNDOS = 15 * 60;
export const MAXIMO_TENTATIVAS_EMAIL = 5;
export const MAXIMO_TENTATIVAS_IP = 20;

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export function somarDias(instante: Date, dias: number): Date {
  return new Date(instante.getTime() + dias * MILISSEGUNDOS_POR_DIA);
}

/** Resumo SHA-256 em hexadecimal. O banco e o Redis guardam só resumos de tokens e e-mails. */
export function resumir(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

/**
 * Token de renovação: 256 bits aleatórios (docs/arquitetura/11). Vai uma vez para o aparelho; o
 * banco guarda só o resumo.
 */
export function gerarTokenRenovacao(): { token: string; resumo: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, resumo: resumir(token) };
}

/** RN-007: documentos cuja versão vigente o usuário ainda não aceitou. */
export function aceitesPendentes(
  aceitos: readonly { documento: DocumentoAceite; versao: string }[],
  vigentes: Record<DocumentoAceite, string> = VERSOES_DOCUMENTOS,
): DocumentoAceite[] {
  return DOCUMENTOS_ACEITE.filter(
    (documento) =>
      !aceitos.some(
        (aceite) => aceite.documento === documento && aceite.versao === vigentes[documento],
      ),
  );
}
