import * as LocalAuthentication from 'expo-local-authentication';

/**
 * O aparelho sem sensor, com sensor sem digital ou rosto cadastrado, ou pronto para usar (a pessoa
 * cadastrou digital ou rosto).
 */
export type SituacaoBiometria = 'sem-sensor' | 'sem-cadastro' | 'pronta';

export async function situacaoBiometria(): Promise<SituacaoBiometria> {
  const [temSensor, cadastrada] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!temSensor) return 'sem-sensor';
  return cadastrada ? 'pronta' : 'sem-cadastro';
}

/**
 * Pede a biometria (ou o código do aparelho, se ela falhar). RN-005: ela só libera o token já
 * guardado; quem confere a sessão é a API.
 */
export async function confirmarBiometria(motivo: string, cancelar: string): Promise<boolean> {
  const resultado = await LocalAuthentication.authenticateAsync({
    promptMessage: motivo,
    cancelLabel: cancelar,
  });
  return resultado.success;
}
