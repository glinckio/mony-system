import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { TelaProvisoria } from '@/ui/tela-provisoria';

export default function NaoEncontrada() {
  const { t } = useTranslation();
  return (
    <TelaProvisoria titulo={t('comum.naoEncontrada.titulo')}>
      <Link href="/" style={estilos.link}>
        {t('comum.naoEncontrada.voltar')}
      </Link>
    </TelaProvisoria>
  );
}

const estilos = StyleSheet.create({
  link: { minHeight: 44, paddingVertical: 12 },
});
