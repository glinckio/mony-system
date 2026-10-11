import * as LocalAuthentication from 'expo-local-authentication';

/** Biometria pronta para uso: o aparelho tem o sensor e a pessoa cadastrou digital ou rosto. */
export async function biometriaDisponivel(): Promise<boolean> {
  const [temSensor, cadastrada] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return temSensor && cadastrada;
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
