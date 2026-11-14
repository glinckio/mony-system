import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { urlDocumento } from '@/lib/config';
import { Texto } from '@/ui';

/** Os links para ler os termos e a política antes do aceite (RN-007, T-140g). */
export function LinksDocumentos() {
  const { t } = useTranslation();
  const links = [
    { documento: 'termos', rotulo: t('auth.documentos.termos') },
    { documento: 'privacidade', rotulo: t('auth.documentos.privacidade') },
  ] as const;
  return (
    <View className="flex-row flex-wrap gap-x-4">
      {links.map(({ documento, rotulo }) => (
        <Pressable
          key={documento}
          accessibilityRole="link"
          accessibilityLabel={rotulo}
          onPress={() => void WebBrowser.openBrowserAsync(urlDocumento(documento))}
          className="min-h-toque justify-center"
        >
          <Texto variante="corpo-sm" className="text-primaria underline">
            {rotulo}
          </Texto>
        </Pressable>
      ))}
    </View>
  );
}
