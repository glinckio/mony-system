import { type ErroApi, obterConfigApp } from '@mony/api-client';
import { versaoAbaixoDaMinima } from '@mony/shared/config-app';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { useAtualizacao } from '@/stores/atualizacao';

/** A versão deste app (a do `package.json`, no app config), que vai em toda chamada. */
export function versaoDoApp(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/**
 * Todo erro da API passa aqui (`aoErro` do cliente gerado e o chat da Mony). Um 426
 * `VERSAO_APP_DESATUALIZADA` troca o app inteiro pela atualização obrigatória.
 */
export function aoErroDaApi(erro: ErroApi): void {
  if (erro.codigo !== 'VERSAO_APP_DESATUALIZADA') return;
  const minima = erro.resposta?.erro.detalhes?.versaoMinima;
  useAtualizacao.getState().exigir(typeof minima === 'string' ? minima : null);
}

/**
 * Na abertura: a versão mínima de `GET /config-app` (rota pública, que responde até para versão
 * antiga). Sem rede, segue: a API recusa a versão antiga na primeira chamada que der certo.
 */
export async function conferirVersaoMinima(): Promise<void> {
  try {
    const { versaoMinima } = await obterConfigApp();
    const plataforma = Platform.OS === 'ios' ? 'ios' : 'android';
    if (versaoAbaixoDaMinima(versaoDoApp(), plataforma, versaoMinima)) {
      useAtualizacao.getState().exigir(versaoMinima[plataforma]);
    }
  } catch {
    // Sem rede ou com a API fora: segue, e a API recusa a versão antiga na primeira chamada.
  }
}
