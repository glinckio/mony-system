import type { DadosDispositivo } from '@mony/shared/autenticacao';
import { CABECALHO_PLATAFORMA, CABECALHO_VERSAO_APP } from '@mony/shared/config-app';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { cofre } from './cofre';

/** Cabeçalho com o identificador do aparelho (doc 04, suporte e sessões por aparelho). */
export const CABECALHO_APARELHO = 'x-device-id';

let identificador: string | null = null;

/**
 * Identificador do aparelho: gerado na primeira abertura e guardado no cofre. É o que liga a
 * sessão ao aparelho (RN-004) e o que "sair deste aparelho" encerra.
 */
export async function prepararAparelho(): Promise<string> {
  if (identificador !== null) return identificador;
  const guardado = await cofre.lerAparelho();
  if (guardado) {
    identificador = guardado;
  } else {
    identificador = randomUUID();
    await cofre.gravarAparelho(identificador);
  }
  return identificador;
}

export async function dadosDoAparelho(): Promise<DadosDispositivo> {
  return {
    identificador: await prepararAparelho(),
    plataforma: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

/** Versão, plataforma e aparelho em toda requisição (a API bloqueia versão antiga com 426). */
export function cabecalhosDoApp(): Record<string, string> {
  return {
    [CABECALHO_VERSAO_APP]: Constants.expoConfig?.version ?? '0.0.0',
    [CABECALHO_PLATAFORMA]: Platform.OS,
    ...(identificador === null ? {} : { [CABECALHO_APARELHO]: identificador }),
  };
}

/** Só para testes: esquece o identificador em memória. */
export function esquecerAparelhoEmMemoria(): void {
  identificador = null;
}
