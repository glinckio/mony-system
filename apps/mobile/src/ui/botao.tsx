import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable } from 'react-native';

import { juntarClasses } from './classes';
import type { NomeIcone } from './icone';
import { type CorTexto, Texto } from './texto';
import { cores } from './tokens';

export type VarianteBotao = 'primaria' | 'secundaria' | 'fantasma' | 'perigo';

const FUNDO: Record<VarianteBotao, string> = {
  primaria: 'bg-primaria active:bg-primaria-forte',
  secundaria: 'border border-borda bg-superficie active:bg-superficie-alta',
  fantasma: 'bg-transparente active:bg-superficie-alta',
  perigo: 'bg-perigo active:opacity-80',
};

const COR_TEXTO: Record<VarianteBotao, CorTexto> = {
  primaria: 'inverso',
  secundaria: 'texto',
  fantasma: 'primaria',
  perigo: 'inverso',
};

const COR_ICONE: Record<VarianteBotao, string> = {
  primaria: cores['texto-inverso'],
  secundaria: cores.texto,
  fantasma: cores.primaria,
  perigo: cores['texto-inverso'],
};

export interface PropsBotao {
  titulo: string;
  aoPressionar: () => void;
  variante?: VarianteBotao;
  /** Mostra o indicador e não aceita toque (ex.: enquanto a API responde). */
  carregando?: boolean;
  desabilitado?: boolean;
  icone?: NomeIcone;
  larguraTotal?: boolean;
  testID?: string;
}

/** Botão com área de toque de 44 pt; carregando ou desabilitado, não responde. */
export function Botao({
  titulo,
  aoPressionar,
  variante = 'primaria',
  carregando = false,
  desabilitado = false,
  icone,
  larguraTotal = false,
  testID,
}: PropsBotao) {
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: inativo, busy: carregando }}
      disabled={inativo}
      onPress={aoPressionar}
      testID={testID}
      className={juntarClasses(
        'min-h-toque flex-row items-center justify-center gap-2 rounded-md px-4',
        FUNDO[variante],
        larguraTotal && 'self-stretch',
        inativo && 'opacity-50',
      )}
    >
      {carregando ? (
        <ActivityIndicator color={COR_ICONE[variante]} />
      ) : icone ? (
        <Ionicons name={icone} size={20} color={COR_ICONE[variante]} />
      ) : null}
      <Texto cor={COR_TEXTO[variante]} className="font-forte">
        {titulo}
      </Texto>
    </Pressable>
  );
}
