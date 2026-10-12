import { DURACAO_MAXIMA_AUDIO_SEGUNDOS } from '@mony/shared/arquivos';
import {
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef } from 'react';

/**
 * Voz em AAC (m4a), mono, 64 kbps: 10 minutos dão uns 4,8 MB, dentro dos 10 MB do envio (doc 11), e
 * a transcrição não perde nada de uma voz.
 */
export const OPCOES_GRAVACAO: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44_100,
  numberOfChannels: 1,
  bitRate: 64_000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/mp4', bitsPerSecond: 64_000 },
};

/** O tipo de conteúdo do arquivo gravado, no `POST /arquivos`. */
export const TIPO_CONTEUDO_GRAVACAO = 'audio/mp4';

/** Resultado de `comecar`: gravando, ou sem a permissão do microfone. */
export type InicioGravacao = 'gravando' | 'semPermissao';

/**
 * Gravação da mensagem de voz para a Mony (T-064): pede o microfone, grava e devolve o arquivo no
 * fim. No limite de 10 minutos, para sozinha e chama `aoLimite` com o arquivo.
 */
export function useGravador(aoLimite: (uri: string) => void) {
  const gravador = useAudioRecorder(OPCOES_GRAVACAO);
  const estado = useAudioRecorderState(gravador, 500);
  const segundos = Math.floor(estado.durationMillis / 1000);
  const parando = useRef(false);

  async function comecar(): Promise<InicioGravacao> {
    const permissao = await requestRecordingPermissionsAsync();
    if (!permissao.granted) return 'semPermissao';
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await gravador.prepareToRecordAsync();
    gravador.record();
    return 'gravando';
  }

  /** Para e devolve o arquivo; `null` se não havia gravação. */
  async function parar(): Promise<string | null> {
    if (parando.current) return null;
    parando.current = true;
    try {
      await gravador.stop();
      await setAudioModeAsync({ allowsRecording: false });
      return gravador.uri;
    } finally {
      parando.current = false;
    }
  }

  useEffect(() => {
    if (!estado.isRecording || segundos < DURACAO_MAXIMA_AUDIO_SEGUNDOS) return;
    void parar().then((uri) => {
      if (uri) aoLimite(uri);
    });
  });

  return { gravando: estado.isRecording, segundos, comecar, parar };
}

/** "0:07", "1:30", "10:00". */
export function duracaoParaTexto(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  return `${String(minutos)}:${String(segundos % 60).padStart(2, '0')}`;
}
