import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { Botao, Folha, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { useExportacaoDados } from '../hooks/use-exportacao-dados';

interface PropsFolhaExportarDados {
  visivel: boolean;
  aoFechar: () => void;
}

/**
 * Exportar meus dados (RN-160, T-140a): pede o arquivo com tudo o que o app guarda (JSON e
 * planilha); enquanto o worker gera, "Juntando seus dados…"; pronto, [Baixar meus dados] abre a
 * URL (24 h), que também vai por e-mail. Depois do prazo, ou se falhou, pede de novo.
 */
export function FolhaExportarDados({ visivel, aoFechar }: PropsFolhaExportarDados) {
  const { t } = useTranslation();
  const { exportacao, carregando, pedir, pedindo, erro } = useExportacaoDados(visivel);
  const gerando = pedindo || exportacao?.status === 'processando';
  const url = exportacao?.status === 'pronta' ? exportacao.url : null;

  return (
    <Folha visivel={visivel} titulo={t('mais.exportarDados.titulo')} aoFechar={aoFechar}>
      <View className="gap-3">
        {carregando ? (
          <ActivityIndicator color={cores.texto} />
        ) : gerando ? (
          <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
            <ActivityIndicator color={cores.texto} />
            <Texto cor="suave" className="flex-1">
              {t('mais.exportarDados.gerando')}
            </Texto>
          </View>
        ) : url !== null ? (
          <>
            <Texto>{t('mais.exportarDados.pronto')}</Texto>
            <Botao
              icone="download"
              larguraTotal
              titulo={t('mais.exportarDados.baixar')}
              aoPressionar={() => {
                void Linking.openURL(url);
              }}
            />
            <Botao
              variante="secundaria"
              larguraTotal
              titulo={t('mais.exportarDados.pedirDeNovo')}
              aoPressionar={pedir}
            />
          </>
        ) : (
          <>
            {exportacao?.status === 'erro' ? (
              <Texto cor="perigo" accessibilityRole="alert">
                {t('mais.exportarDados.falhou')}
              </Texto>
            ) : exportacao?.status === 'pronta' ? (
              <Texto cor="suave">{t('mais.exportarDados.expirou')}</Texto>
            ) : null}
            {erro ? (
              <Texto cor="perigo" accessibilityRole="alert">
                {mensagemDeErro(erro, t('mais.semConexao'))}
              </Texto>
            ) : null}
            <Texto cor="suave">{t('mais.exportarDados.ajuda')}</Texto>
            <Botao larguraTotal titulo={t('mais.exportarDados.pedir')} aoPressionar={pedir} />
          </>
        )}
      </View>
    </Folha>
  );
}
