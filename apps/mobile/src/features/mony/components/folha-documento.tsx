import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Botao, Folha, Texto } from '@/ui';

export type OrigemDocumento = 'camera' | 'galeria' | 'pdf';

interface PropsFolhaDocumento {
  visivel: boolean;
  aoFechar: () => void;
  aoEscolher: (origem: OrigemDocumento) => void;
  /** O QR Code do cupom fiscal (T-066b). */
  aoLerQr: () => void;
}

/**
 * Foto, print ou PDF para a Mony ler (T-065): câmera, galeria ou arquivo; e o QR Code do cupom
 * fiscal, que a Mony busca na Sefaz (T-066b).
 */
export function FolhaDocumento({ visivel, aoFechar, aoEscolher, aoLerQr }: PropsFolhaDocumento) {
  const { t } = useTranslation();
  return (
    <Folha visivel={visivel} titulo={t('mony.documento.titulo')} aoFechar={aoFechar}>
      <View className="gap-2">
        <Texto cor="suave">{t('mony.documento.ajuda')}</Texto>
        <Botao
          variante="secundaria"
          icone="qr-code"
          larguraTotal
          titulo={t('mony.documento.qr')}
          aoPressionar={aoLerQr}
        />
        <Botao
          variante="secundaria"
          icone="camera"
          larguraTotal
          titulo={t('mony.documento.camera')}
          aoPressionar={() => {
            aoEscolher('camera');
          }}
        />
        <Botao
          variante="secundaria"
          icone="scan-text"
          larguraTotal
          titulo={t('mony.documento.galeria')}
          aoPressionar={() => {
            aoEscolher('galeria');
          }}
        />
        <Botao
          variante="secundaria"
          icone="paperclip"
          larguraTotal
          titulo={t('mony.documento.pdf')}
          aoPressionar={() => {
            aoEscolher('pdf');
          }}
        />
      </View>
    </Folha>
  );
}
