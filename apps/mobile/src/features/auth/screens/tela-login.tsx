import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useSessao } from '@/stores/sessao';
import { TelaProvisoria } from '@/ui/tela-provisoria';

/** Usuário fictício do atalho de desenvolvimento. Não existe na API. */
const USUARIO_DESENVOLVIMENTO = {
  id: 'desenvolvimento',
  nome: 'Desenvolvimento',
  onboardingConcluido: true,
};

export default function TelaLogin() {
  const { t } = useTranslation();
  const iniciar = useSessao((estado) => estado.iniciar);
  return (
    <TelaProvisoria titulo={t('auth.login.titulo')}>
      {/* `__DEV__` é falso em preview e produção: o atalho sai do bundle desses builds. */}
      {__DEV__ ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            iniciar(USUARIO_DESENVOLVIMENTO, null);
          }}
          style={estilos.botao}
        >
          <Text>{t('auth.login.entrarSemConta')}</Text>
        </Pressable>
      ) : null}
    </TelaProvisoria>
  );
}

const estilos = StyleSheet.create({
  botao: { minHeight: 44, justifyContent: 'center' },
});
