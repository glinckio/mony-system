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
 * Abre a escolha da conta do Google. `null` quando a pessoa desiste. Depois, o acesso do app à conta
 * é desfeito (`revokeAccess`) e a sessão do Google no app encerrada: o servidor aceita cada
 * `id_token` uma vez só, e o Google Play devolvia o mesmo token guardado por até 1 hora. Sem o
 * `revokeAccess`, entrar de novo logo depois (sair, excluir a conta e voltar) dava "Não
 * conseguimos confirmar seu login com o Google" (T-055c). A próxima vez mostra a escolha de novo.
 */
export async function escolherContaGoogle(): Promise<ContaGoogle | null> {
  const { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } = carregarModulo();
  GoogleSignin.configure({ webClientId: configApp.googleIdClienteWeb });
  let entrou = false;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const resposta = await GoogleSignin.signIn();
    if (isCancelledResponse(resposta)) return null;
    entrou = true;
    const { idToken, user } = resposta.data;
    if (!idToken) throw new Error('O Google não devolveu o id_token.');
    return { idToken, nome: user.name };
  } catch (erro) {
    if (isErrorWithCode(erro) && erro.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw erro;
  } finally {
    if (entrou) await GoogleSignin.revokeAccess().catch(() => undefined);
    await GoogleSignin.signOut().catch(() => undefined);
  }
}
