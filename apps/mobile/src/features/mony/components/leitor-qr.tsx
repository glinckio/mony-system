import { lerQrNfce } from '@mony/shared/nfce';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Botao, BotaoIcone, Texto } from '@/ui';

interface PropsLeitorQr {
  visivel: boolean;
  aoFechar: () => void;
  /** O conteúdo do QR Code de um cupom fiscal de verdade (conferido com `lerQrNfce`). */
  aoLer: (conteudo: string) => void;
}

/** O aviso para o que a câmera leu, ou `null` quando é um cupom que vale. */
type Aviso = 'SEM_CHAVE' | 'DIGITO_INVALIDO' | 'UF_INVALIDA' | 'NAO_E_NFCE' | 'homologacao';

function avisoDaLeitura(conteudo: string): Aviso | null {
  const leitura = lerQrNfce(conteudo);
  if (!leitura.ok) return leitura.erro;
  return leitura.ambiente === 'homologacao' ? 'homologacao' : null;
}

/**
 * Leitor do QR Code do cupom fiscal (T-066b, doc 10 "NFC-e"): a câmera só procura QR Code; o que
 * ela lê é conferido na hora com `lerQrNfce` (sem rede). QR que não é de cupom, danificado ou de
 * teste do estabelecimento só avisa e a câmera continua; o cupom que vale fecha o leitor e vai
 * para a Mony.
 */
export function LeitorQr({ visivel, aoFechar, aoLer }: PropsLeitorQr) {
  const { t } = useTranslation();
  const { top, bottom } = useSafeAreaInsets();
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [aviso, definirAviso] = useState<Aviso | null>(null);
  // A câmera avisa várias vezes por segundo o mesmo código: só o primeiro vale, e depois do
  // cupom lido nada mais, até abrir de novo.
  const ultimo = useRef<string | null>(null);
  const lido = useRef(false);

  useEffect(() => {
    if (!visivel) return;
    ultimo.current = null;
    lido.current = false;
  }, [visivel]);

  function fechar() {
    definirAviso(null);
    aoFechar();
  }

  function aoLerCodigo({ data }: { data: string }) {
    if (lido.current || data === ultimo.current) return;
    ultimo.current = data;
    const problema = avisoDaLeitura(data);
    definirAviso(problema);
    if (problema !== null) return;
    lido.current = true;
    fechar();
    aoLer(data);
  }

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={fechar} statusBarTranslucent>
      <View className="flex-1 bg-fundo" style={{ paddingTop: top, paddingBottom: bottom }}>
        <View className="flex-row items-center gap-2 px-4 py-2">
          <Texto variante="titulo" accessibilityRole="header" className="flex-1">
            {t('mony.nfce.titulo')}
          </Texto>
          <BotaoIcone icone="x" rotulo={t('mony.nfce.fechar')} aoPressionar={fechar} />
        </View>
        {permissao?.granted ? (
          <View className="flex-1">
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={visivel ? aoLerCodigo : undefined}
            />
            <View className="absolute inset-x-4 bottom-6 gap-2 rounded-md bg-superficie p-4">
              <Texto>{t('mony.nfce.ajuda')}</Texto>
              {aviso ? (
                <Texto cor="atencao" accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {t(`mony.nfce.avisos.${aviso}`)}
                </Texto>
              ) : null}
            </View>
          </View>
        ) : permissao ? (
          <View className="flex-1 justify-center gap-4 px-6">
            <Texto>{t('mony.nfce.semPermissao')}</Texto>
            {permissao.canAskAgain ? (
              <Botao
                larguraTotal
                titulo={t('mony.nfce.permitir')}
                aoPressionar={() => void pedirPermissao()}
              />
            ) : (
              <Botao
                variante="secundaria"
                larguraTotal
                titulo={t('mony.nfce.ajustes')}
                aoPressionar={() => void Linking.openSettings()}
              />
            )}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
