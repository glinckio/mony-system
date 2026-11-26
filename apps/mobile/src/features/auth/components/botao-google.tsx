import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { ProvedorLoginSocial } from '@mony/shared/enums';

import { appleDisponivel, escolherContaApple } from '@/lib/auth/apple';
import { googleDisponivel } from '@/lib/auth/google';
import { Botao, Texto } from '@/ui';

import { useEntrarComGoogle } from '../login-google';
import { ErroDoFormulario } from '../screens/tela-formulario';

/**
 * O botão oficial da Apple (as regras da App Store pedem o desenho dela), carregado só no iPhone que
 * oferece o login: o módulo nativo não existe nos testes nem no Android.
 */
function BotaoApple({ aoPressionar, ocupado }: { aoPressionar: () => void; ocupado: boolean }) {
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- carregamento tardio de propósito
  const apple = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
  return (
    <View
      testID="entrar-apple"
      accessibilityLabel={t('auth.apple.entrar')}
      style={{ opacity: ocupado ? 0.5 : 1 }}
    >
      <apple.AppleAuthenticationButton
        buttonType={apple.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={apple.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={12}
        style={{ height: 48, width: '100%' }}
        onPress={() => {
          if (!ocupado) aoPressionar();
        }}
      />
    </View>
  );
}

type AoPedirSenha = (email: string | null, provedor: ProvedorLoginSocial) => void;

async function escolherApple() {
  const conta = await escolherContaApple();
  return conta === null ? null : { provedor: 'apple' as const, ...conta };
}

/**
 * "ou" + [Entrar com a Apple] (só no iPhone, T-055b) + [Entrar com Google] (T-055a). Cada um some
 * quando o build ou o aparelho não tem aquele login.
 */
export function BotaoGoogle({ aoPedirSenha }: { aoPedirSenha: AoPedirSenha }) {
  const { t } = useTranslation();
  const google = useEntrarComGoogle(aoPedirSenha);
  const apple = useEntrarComGoogle(aoPedirSenha, escolherApple);
  const [comApple, definirComApple] = useState(false);
  useEffect(() => {
    let ativo = true;
    void appleDisponivel().then((sim) => {
      if (ativo) definirComApple(sim);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const comGoogle = googleDisponivel();
  if (!comGoogle && !comApple) return null;
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 border-t border-vidro-forte" />
        <Texto variante="legenda" cor="suave">
          {t('auth.google.ou')}
        </Texto>
        <View className="flex-1 border-t border-vidro-forte" />
      </View>
      {comApple ? (
        <BotaoApple aoPressionar={() => void apple.entrar()} ocupado={apple.ocupado} />
      ) : null}
      {comGoogle ? (
        <Botao
          variante="secundaria"
          titulo={t('auth.google.entrar')}
          aoPressionar={() => void google.entrar()}
          carregando={google.ocupado}
          larguraTotal
          testID="entrar-google"
        />
      ) : null}
      <ErroDoFormulario mensagem={apple.erro ?? google.erro} />
    </View>
  );
}
