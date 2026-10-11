import * as SecureStore from 'expo-secure-store';

/**
 * O que fica no Keychain (iOS) e no Keystore (Android) pelo `expo-secure-store` (doc 04): o token
 * de renovação, o identificador do aparelho e a escolha da biometria. O token de acesso fica só em
 * memória. Só neste aparelho e depois do primeiro desbloqueio: não vai para backup nem para outro
 * aparelho.
 */
const OPCOES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const CHAVES = {
  renovacao: 'mony.renovacao',
  aparelho: 'mony.aparelho',
  biometria: 'mony.biometria',
} as const;

export const cofre = {
  lerRenovacao: () => SecureStore.getItemAsync(CHAVES.renovacao, OPCOES),
  gravarRenovacao: (valor: string) => SecureStore.setItemAsync(CHAVES.renovacao, valor, OPCOES),
  apagarRenovacao: () => SecureStore.deleteItemAsync(CHAVES.renovacao, OPCOES),
  lerAparelho: () => SecureStore.getItemAsync(CHAVES.aparelho, OPCOES),
  gravarAparelho: (valor: string) => SecureStore.setItemAsync(CHAVES.aparelho, valor, OPCOES),
  biometriaLigada: async () => (await SecureStore.getItemAsync(CHAVES.biometria, OPCOES)) === '1',
  ligarBiometria: (ligada: boolean) =>
    ligada
      ? SecureStore.setItemAsync(CHAVES.biometria, '1', OPCOES)
      : SecureStore.deleteItemAsync(CHAVES.biometria, OPCOES),
};
