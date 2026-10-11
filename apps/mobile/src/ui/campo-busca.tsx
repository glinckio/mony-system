import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';

import { BotaoIcone } from './botao-icone';
import { Icone } from './icone';
import { cores } from './tokens';

export interface PropsCampoBusca {
  /** Rótulo e texto de exemplo ("Buscar lançamento"). */
  rotulo: string;
  valor: string;
  aoMudar: (texto: string) => void;
  testID?: string;
}

/** Busca em pílula de vidro, com a lupa e o X que limpa (design: "Buscar lançamento"). */
export function CampoBusca({ rotulo, valor, aoMudar, testID }: PropsCampoBusca) {
  const { t } = useTranslation();
  return (
    <View className="min-h-botao flex-1 flex-row items-center gap-2 rounded-total border border-vidro bg-vidro pl-4 pr-1">
      <Icone nome="search" tamanho={18} cor={cores['texto-suave']} />
      <TextInput
        accessibilityLabel={rotulo}
        placeholder={rotulo}
        placeholderTextColor={cores['texto-suave']}
        selectionColor={cores.primaria}
        value={valor}
        onChangeText={aoMudar}
        returnKeyType="search"
        autoCorrect={false}
        testID={testID}
        className="min-h-botao flex-1 text-corpo text-texto"
      />
      {valor === '' ? null : (
        <BotaoIcone
          icone="x"
          rotulo={t('ui.limparBusca')}
          aoPressionar={() => {
            aoMudar('');
          }}
        />
      )}
    </View>
  );
}
