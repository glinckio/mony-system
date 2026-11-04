import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { googleDisponivel } from '@/lib/auth/google';
import { Botao, Texto } from '@/ui';

import { useEntrarComGoogle } from '../login-google';
import { ErroDoFormulario } from '../screens/tela-formulario';

/**
 * "ou" + [Entrar com Google] (T-055a). Some quando o build não tem o login do Google (iPhone até a
 * T-055b, ou sem o cliente configurado).
 */
export function BotaoGoogle({ aoPedirSenha }: { aoPedirSenha: (email: string | null) => void }) {
  const { t } = useTranslation();
  const { entrar, ocupado, erro } = useEntrarComGoogle(aoPedirSenha);
  if (!googleDisponivel()) return null;
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-vidro-forte" />
        <Texto variante="legenda" cor="suave">
          {t('auth.google.ou')}
        </Texto>
        <View className="h-px flex-1 bg-vidro-forte" />
      </View>
      <Botao
        variante="secundaria"
        titulo={t('auth.google.entrar')}
        aoPressionar={() => void entrar()}
        carregando={ocupado}
        larguraTotal
        testID="entrar-google"
      />
      <ErroDoFormulario mensagem={erro} />
    </View>
  );
}
