import type { TokenSegundoPlano } from '@mony/shared/autenticacao';
import * as SecureStore from 'expo-secure-store';

/**
 * O que fica no Keychain (iOS) e no Keystore (Android) pelo `expo-secure-store` (doc 04): o token
 * de renovação, o token de segundo plano (T-088b), o identificador do aparelho e a escolha da
 * biometria. O token de acesso fica só em memória. Só neste aparelho e depois do primeiro
 * desbloqueio: não vai para backup nem para outro aparelho. Sem biometria em nenhum deles, porque
 * a tarefa do push lê o de segundo plano sem a tela.
 */
const OPCOES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const CHAVES = {
  renovacao: 'mony.renovacao',
  segundoPlano: 'mony.segundo-plano',
  aparelho: 'mony.aparelho',
  biometria: 'mony.biometria',
} as const;

export const cofre = {
  lerRenovacao: () => SecureStore.getItemAsync(CHAVES.renovacao, OPCOES),
  gravarRenovacao: (valor: string) => SecureStore.setItemAsync(CHAVES.renovacao, valor, OPCOES),
  apagarRenovacao: () => SecureStore.deleteItemAsync(CHAVES.renovacao, OPCOES),
  /** O token da tarefa do push com o app fechado (T-088b); `null` se não há ou se está ilegível. */
  lerSegundoPlano: async (): Promise<TokenSegundoPlano | null> => {
    const texto = await SecureStore.getItemAsync(CHAVES.segundoPlano, OPCOES);
    if (texto === null) return null;
    try {
      const lido = JSON.parse(texto) as Partial<TokenSegundoPlano>;
      return typeof lido.token === 'string' && typeof lido.expiraEm === 'string'
        ? { token: lido.token, expiraEm: lido.expiraEm }
        : null;
    } catch {
      return null;
    }
  },
  gravarSegundoPlano: (valor: TokenSegundoPlano) =>
    SecureStore.setItemAsync(CHAVES.segundoPlano, JSON.stringify(valor), OPCOES),
  apagarSegundoPlano: () => SecureStore.deleteItemAsync(CHAVES.segundoPlano, OPCOES),
  lerAparelho: () => SecureStore.getItemAsync(CHAVES.aparelho, OPCOES),
  gravarAparelho: (valor: string) => SecureStore.setItemAsync(CHAVES.aparelho, valor, OPCOES),
  biometriaLigada: async () => (await SecureStore.getItemAsync(CHAVES.biometria, OPCOES)) === '1',
  ligarBiometria: (ligada: boolean) =>
    ligada
      ? SecureStore.setItemAsync(CHAVES.biometria, '1', OPCOES)
      : SecureStore.deleteItemAsync(CHAVES.biometria, OPCOES),
};
