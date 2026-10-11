import { useTranslation } from 'react-i18next';
import { Image, type ImageSourcePropType } from 'react-native';

/* eslint-disable @typescript-eslint/no-require-imports -- o Metro só empacota imagem pedida por `require` estático */
const IMAGENS = {
  bloco: require('../../assets/images/logo-bloco.png') as ImageSourcePropType,
  marca: require('../../assets/images/marca.png') as ImageSourcePropType,
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Proporção da marca (o M sozinho), largura por altura. */
const PROPORCAO_MARCA = 1045 / 651;

export interface PropsLogo {
  /** `bloco`: quadrado branco com a marca (login, bloqueio); `marca`: só o M (avatar da Mony). */
  tipo?: keyof typeof IMAGENS;
  /** Largura em pt. */
  tamanho?: number;
}

/**
 * Logo provisório, tirado do PDF das telas (T-017), até o cliente mandar o arquivo original.
 */
export function Logo({ tipo = 'bloco', tamanho = 56 }: PropsLogo) {
  const { t } = useTranslation();
  return (
    <Image
      source={IMAGENS[tipo]}
      accessibilityRole="image"
      accessibilityLabel={t('ui.logo')}
      style={{
        width: tamanho,
        height: tipo === 'bloco' ? tamanho : tamanho / PROPORCAO_MARCA,
      }}
      resizeMode="contain"
    />
  );
}
