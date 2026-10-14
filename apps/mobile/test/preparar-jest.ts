import { jest } from '@jest/globals';

// Nos testes o app roda com a configuração de desenvolvimento, a mesma do `expo start` sem `.env`.
jest.mock('expo-constants', () => {
  const real = jest.requireActual<{ default: object }>('expo-constants');
  const { criarConfigApp } = jest.requireActual<typeof import('../app.config')>('../app.config');
  return {
    __esModule: true,
    default: { ...real.default, expoConfig: criarConfigApp({ name: 'teste', slug: 'teste' }, {}) },
  };
});

// O AsyncStorage (modo privacidade) em memória.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Cofre do aparelho (Keychain/Keystore) em memória; `cofreFalso` limpa entre testes.
jest.mock('expo-secure-store', () => {
  const guardados = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    getItemAsync: jest.fn((chave: string) => Promise.resolve(guardados.get(chave) ?? null)),
    setItemAsync: (chave: string, valor: string) => {
      guardados.set(chave, valor);
      return Promise.resolve();
    },
    deleteItemAsync: (chave: string) => {
      guardados.delete(chave);
      return Promise.resolve();
    },
    __guardados: guardados,
  };
});

// Biometria: os testes dizem se o aparelho tem e se a pessoa confirma.
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID(),
}));

// Gravador de voz da Mony (T-064): `record` e `stop` mudam o estado que o hook lê; os testes mudam
// a duração com `__gravador.simularDuracao` e a permissão pelo mock de
// `requestRecordingPermissionsAsync`.
jest.mock('expo-audio', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  const ouvintes = new Set<() => void>();
  let estado = { isRecording: false, durationMillis: 0 };
  const mudar = (novo: Partial<typeof estado>) => {
    estado = { ...estado, ...novo };
    for (const ouvinte of ouvintes) ouvinte();
  };
  const gravador = {
    uri: null as string | null,
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    record: jest.fn(() => {
      gravador.uri = 'file:///cache/Audio/gravacao.m4a';
      mudar({ isRecording: true, durationMillis: 0 });
    }),
    stop: jest.fn(() => {
      mudar({ isRecording: false });
      return Promise.resolve();
    }),
    simularDuracao: (segundos: number) => {
      mudar({ durationMillis: segundos * 1000 });
    },
    /** Entre testes, sem avisar a tela (já desmontada ou de saída). */
    reiniciar: () => {
      gravador.uri = null;
      estado = { isRecording: false, durationMillis: 0 };
    },
  };
  return {
    AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
    IOSOutputFormat: { MPEG4AAC: 'aac ' },
    requestRecordingPermissionsAsync: jest.fn(() =>
      Promise.resolve({ granted: true, status: 'granted' }),
    ),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    useAudioRecorder: () => gravador,
    useAudioRecorderState: () =>
      useSyncExternalStore(
        (ouvinte: () => void) => {
          ouvintes.add(ouvinte);
          return () => ouvintes.delete(ouvinte);
        },
        () => estado,
      ),
    __gravador: gravador,
  };
});

// Leitor do QR Code do cupom (T-066b): a `CameraView` falsa guarda o `onBarcodeScanned`, e os
// testes "apontam" para um código com `__camera.ler(conteudo)`; a permissão muda com
// `__camera.permissao`.
jest.mock('expo-camera', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const camera = {
    aoLer: undefined as ((mockLeitura: { type: string; data: string }) => void) | undefined,
    permissao: { granted: true, canAskAgain: true, status: 'granted' },
    pedir: jest.fn(() => Promise.resolve(camera.permissao)),
    ler: (data: string) => {
      camera.aoLer?.({ type: 'qr', data });
    },
    reiniciar: () => {
      camera.aoLer = undefined;
      camera.permissao = { granted: true, canAskAgain: true, status: 'granted' };
      camera.pedir.mockClear();
    },
  };
  return {
    CameraView: (propriedades: { onBarcodeScanned?: typeof camera.aoLer }) => {
      camera.aoLer = propriedades.onBarcodeScanned;
      return createElement(View, { testID: 'camera' });
    },
    useCameraPermissions: () => [camera.permissao, camera.pedir],
    __camera: camera,
  };
});
