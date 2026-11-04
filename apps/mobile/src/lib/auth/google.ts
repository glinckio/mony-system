import { Platform } from 'react-native';

import { configApp } from '@/lib/config';

/*
 * Entrar com Google (RN-002, T-055a) pelo `@react-native-google-signin/google-signin`, só no
 * Android por enquanto: o iPhone precisa do cliente OAuth do iOS (T-055b). O módulo nativo é
 * carregado só quando a pessoa toca o botão, para o app abrir sem ele (Expo Go, testes).
 *
 * O Google confere o pacote e o SHA-1 da assinatura do app no cliente OAuth "Android" do Google
 * Cloud; o `id_token` sai com a audiência do cliente "Aplicativo da Web" (`googleIdClienteWeb`), que
 * o servidor aceita pela `GOOGLE_CLIENT_IDS`.
 */

/** O botão aparece no Android com o cliente configurado no build. */
export function googleDisponivel(): boolean {
  return Platform.OS === 'android' && configApp.googleIdClienteWeb !== undefined;
}

type ModuloGoogle = typeof import('@react-native-google-signin/google-signin');

/** O módulo nativo só no toque: importado no topo, derrubaria o app em build sem ele. */
function carregarModulo(): ModuloGoogle {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- carregamento tardio de propósito
  return require('@react-native-google-signin/google-signin') as ModuloGoogle;
}

export interface ContaGoogle {
  idToken: string;
  nome: string | null;
}

/**
 * Abre a escolha da conta do Google. `null` quando a pessoa desiste. A sessão do Google no app é
 * encerrada logo depois: o Mony usa o `id_token` uma vez, e a próxima vez mostra a escolha de novo.
 */
export async function escolherContaGoogle(): Promise<ContaGoogle | null> {
  const { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } = carregarModulo();
  GoogleSignin.configure({ webClientId: configApp.googleIdClienteWeb });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const resposta = await GoogleSignin.signIn();
    if (isCancelledResponse(resposta)) return null;
    const { idToken, user } = resposta.data;
    if (!idToken) throw new Error('O Google não devolveu o id_token.');
    return { idToken, nome: user.name };
  } catch (erro) {
    if (isErrorWithCode(erro) && erro.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw erro;
  } finally {
    await GoogleSignin.signOut().catch(() => undefined);
  }
}
