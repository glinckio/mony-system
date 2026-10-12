import { Pressable, View } from 'react-native';

import { juntarClasses } from './classes';
import { Texto } from './texto';

export interface OpcaoSegmentado<T extends string> {
  valor: T;
  rotulo: string;
}

export interface PropsSegmentado<T extends string> {
  /** O que as abas escolhem, para o leitor de tela ("Tipo de categoria"). */
  rotulo: string;
  opcoes: readonly OpcaoSegmentado<T>[];
  selecionado: T;
  aoEscolher: (valor: T) => void;
}

/**
 * Abas em pílula, como "Despesas (9) | Receitas (3)" nas categorias e "Em andamento | Quitados"
 * nos parcelamentos do design: a escolhida fica clara sobre o vidro.
 */
export function Segmentado<T extends string>({
  rotulo,
  opcoes,
  selecionado,
  aoEscolher,
}: PropsSegmentado<T>) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={rotulo}
      className="flex-row rounded-total border border-vidro bg-vidro p-1"
    >
      {opcoes.map((opcao) => {
        const ativa = opcao.valor === selecionado;
        return (
          <Pressable
            key={opcao.valor}
            accessibilityRole="tab"
            accessibilityLabel={opcao.rotulo}
            accessibilityState={{ selected: ativa }}
            onPress={() => {
              aoEscolher(opcao.valor);
            }}
            className={juntarClasses(
              'min-h-toque flex-1 items-center justify-center rounded-total px-2',
              ativa && 'bg-claro',
            )}
          >
            <Texto cor={ativa ? 'inverso' : 'suave'} className="font-forte">
              {opcao.rotulo}
            </Texto>
          </Pressable>
        );
      })}
    </View>
  );
}
