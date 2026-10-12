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
  /** Mais baixo, para ações dentro de um card (ex.: "Guardar" na meta). */
  compacto?: boolean;
  /** Para o leitor de tela, quando o título sozinho não diz qual é (ex.: "Guardar em Viagem"). */
  rotulo?: string;
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
  compacto = false,
  rotulo,
  testID,
}: PropsBotao) {
  const inativo = desabilitado || carregando;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo ?? titulo}
      accessibilityState={{ disabled: inativo, busy: carregando }}
      disabled={inativo}
      onPress={aoPressionar}
      testID={testID}
      className={juntarClasses(
        'flex-row items-center justify-center gap-2 rounded-total active:opacity-80',
        compacto ? 'min-h-toque px-4' : 'min-h-botao px-5',
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
      <Texto
        variante={compacto ? 'corpo-sm' : 'corpo'}
        cor={COR_TEXTO[variante]}
        className="font-forte"
      >
        {titulo}
      </Texto>
    </Pressable>
  );
}
