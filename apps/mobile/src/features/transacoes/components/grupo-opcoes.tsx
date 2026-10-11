import { View } from 'react-native';

import { Chip, Texto } from '@/ui';

export interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
}

export interface PropsGrupoOpcoes<T extends string> {
  titulo: string;
  opcoes: readonly Opcao<T>[];
  /** O escolhido; `undefined` ou `null` quando nenhum. */
  selecionado: T | null | undefined;
  aoEscolher: (valor: T) => void;
  desabilitado?: boolean;
  /** Erro de validação do grupo (ex.: "Escolha a categoria."). */
  erro?: string | null;
  /** Quando não há opção nenhuma (ex.: "Nenhum cartão cadastrado."). */
  vazio?: string;
}

/** Uma escolha entre poucas opções, em chips: tipo, categoria, forma de pagamento, cartão. */
export function GrupoOpcoes<T extends string>({
  titulo,
  opcoes,
  selecionado,
  aoEscolher,
  desabilitado = false,
  erro,
  vazio,
}: PropsGrupoOpcoes<T>) {
  return (
    <View className="gap-2" accessibilityLabel={titulo}>
      <Texto variante="corpo-sm" cor="suave" className="font-medio">
        {titulo}
      </Texto>
      {opcoes.length === 0 && vazio ? (
        <Texto variante="corpo-sm" cor="fraco">
          {vazio}
        </Texto>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {opcoes.map((opcao) => (
            <Chip
              key={opcao.valor}
              rotulo={opcao.rotulo}
              selecionado={opcao.valor === selecionado}
              desabilitado={desabilitado}
              aoPressionar={() => {
                aoEscolher(opcao.valor);
              }}
            />
          ))}
        </View>
      )}
      {erro ? (
        <Texto variante="legenda" cor="perigo" accessibilityLiveRegion="polite">
          {erro}
        </Texto>
      ) : null}
    </View>
  );
}
