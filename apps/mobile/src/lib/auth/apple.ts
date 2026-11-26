import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/*
 * Entrar com a Apple (RN-002, T-055b), obrigatório na App Store para app que oferece o Google. Só no
 * iPhone. O app gera o nonce, manda à Apple o resumo SHA-256 (hex) e ao servidor o valor original:
 * o servidor confere o resumo dentro do `id_token` (`nonceConfere`). O módulo nativo é carregado só
 * no uso, como o do Google.
 */

type ModuloApple = typeof import('expo-apple-authentication');

function carregarModulo(): ModuloApple {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- carregamento tardio de propósito
  return require('expo-apple-authentication') as ModuloApple;
}

/** O botão aparece no iPhone quando o aparelho oferece o "Entrar com a Apple". */
export async function appleDisponivel(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return carregarModulo()
    .isAvailableAsync()
    .catch(() => false);
}

export interface ContaApple {
  idToken: string;
  nonce: string;
  nome: string | null;
}

/** Nome só vem no primeiro login da pessoa no app; depois, a Apple manda vazio. */
function nomeDe(nome: { givenName: string | null; familyName: string | null } | null) {
  const partes = [nome?.givenName, nome?.familyName].filter(
    (parte): parte is string => typeof parte === 'string' && parte.trim() !== '',
  );
  return partes.length > 0 ? partes.join(' ') : null;
}

/** Abre o "Entrar com a Apple". `null` quando a pessoa desiste. */
export async function escolherContaApple(): Promise<ContaApple | null> {
  const apple = carregarModulo();
  const nonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replaceAll('-', '');
  const resumo = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
  try {
    const credencial = await apple.signInAsync({
      requestedScopes: [
        apple.AppleAuthenticationScope.FULL_NAME,
        apple.AppleAuthenticationScope.EMAIL,
      ],
      nonce: resumo,
    });
    if (!credencial.identityToken) throw new Error('A Apple não devolveu o id_token.');
    return { idToken: credencial.identityToken, nonce, nome: nomeDe(credencial.fullName) };
  } catch (erro) {
    if (typeof erro === 'object' && erro !== null && 'code' in erro) {
      if (erro.code === 'ERR_REQUEST_CANCELED') return null;
    }
    throw erro;
  }
}
