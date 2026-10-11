import { ActivityIndicator, Pressable } from 'react-native';

import { juntarClasses } from './classes';
import { Icone, type NomeIcone } from './icone';
import { type CorTexto, Texto } from './texto';
import { cores } from './tokens';

export type VarianteBotao = 'primaria' | 'secundaria' | 'fantasma' | 'perigo';

/**
 * Variantes do design: `primaria` é o botão claro ("Continuar", "Concluir"); `secundaria`, o de
 * vidro sobre o degradê ("Continuar com Google", "Adicionar orçamento"); `fantasma`, o link
 * ("Configurar depois"); `perigo`, a ação que apaga ou bloqueia.
 */
const FUNDO: Record<VarianteBotao, string> = {
  primaria: 'bg-claro',
  secundaria: 'border border-vidro bg-vidro',
  fantasma: 'bg-transparente',
  perigo: 'bg-perigo-suave',
};

const COR_TEXTO: Record<VarianteBotao, CorTexto> = {
  primaria: 'inverso',
  secundaria: 'texto',
  fantasma: 'link',
  perigo: 'perigo',
};

const COR_ICONE: Record<VarianteBotao, string> = {
  primaria: cores['texto-inverso'],
  secundaria: cores.texto,
  fantasma: cores.link,
  perigo: cores.perigo,
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

/** Botão em pílula, de 50 pt de altura; carregando ou desabilitado, não responde. */
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
        'min-h-botao flex-row items-center justify-center gap-2 rounded-total px-5 active:opacity-80',
        FUNDO[variante],
        larguraTotal && 'self-stretch',
        inativo && 'opacity-50',
      )}
    >
      {carregando ? (
        <ActivityIndicator color={COR_ICONE[variante]} />
      ) : icone ? (
        <Icone nome={icone} tamanho={18} cor={COR_ICONE[variante]} />
      ) : null}
      <Texto cor={COR_TEXTO[variante]} className="font-forte">
        {titulo}
      </Texto>
    </Pressable>
  );
}
