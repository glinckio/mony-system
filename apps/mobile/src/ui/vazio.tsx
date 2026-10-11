import { View } from 'react-native';

import { Botao } from './botao';
import { Texto } from './texto';

export interface PropsVazio {
  titulo: string;
  descricao?: string;
  acao?: { titulo: string; aoPressionar: () => void };
}

/** Lista ou tela sem nada ainda, com a ação que resolve (ex.: "Cadastrar cartão"). */
export function Vazio({ titulo, descricao, acao }: PropsVazio) {
  return (
    <View className="items-center gap-3 p-6">
      <Texto variante="titulo" accessibilityRole="header" className="text-center">
        {titulo}
      </Texto>
      {descricao ? (
        <Texto cor="suave" className="text-center">
          {descricao}
        </Texto>
      ) : null}
      {acao ? (
        <Botao variante="secundaria" titulo={acao.titulo} aoPressionar={acao.aoPressionar} />
      ) : null}
    </View>
  );
}
