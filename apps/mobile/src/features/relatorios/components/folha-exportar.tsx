import type { FormatoExportacao } from '@mony/shared/enums';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { Botao, Folha, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { useExportacao } from '../hooks/use-exportacao';
import type { PeriodoRelatorio } from '../lib/periodos';

interface PropsFolhaExportar {
  visivel: boolean;
  aoFechar: () => void;
  periodo: PeriodoRelatorio;
}

/**
 * Baixar o relatório (RN-151, T-125): PDF ou planilha do período da aba; enquanto o worker gera,
 * "Gerando…"; pronto, [Abrir o relatório] abre a URL (válida por 24 h). No gratuito, a mensagem da
 * API e o [Ver planos] (RN-120).
 */
export function FolhaExportar({ visivel, aoFechar, periodo }: PropsFolhaExportar) {
  const { t } = useTranslation();
  const router = useRouter();
  const { exportacao, pedir, pedindo, erro, limite, recomecar } = useExportacao();
  const gerando = pedindo || exportacao?.status === 'processando';

  function fechar() {
    recomecar();
    aoFechar();
  }

  const escolher = (formato: FormatoExportacao) => {
    pedir(formato, periodo);
  };

  return (
    <Folha visivel={visivel} titulo={t('relatorios.exportar.titulo')} aoFechar={fechar}>
      <View className="gap-3">
        {gerando ? (
          <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
            <ActivityIndicator color={cores.texto} />
            <Texto cor="suave">{t('relatorios.exportar.gerando')}</Texto>
          </View>
        ) : exportacao?.status === 'pronta' && exportacao.url !== null ? (
          <>
            <Texto>{t('relatorios.exportar.pronto')}</Texto>
            <Botao
              icone="download"
              larguraTotal
              titulo={t('relatorios.exportar.abrir')}
              aoPressionar={() => {
                if (exportacao.url !== null) void Linking.openURL(exportacao.url);
              }}
            />
          </>
        ) : exportacao?.status === 'erro' ? (
          <>
            <Texto cor="perigo">{t('relatorios.exportar.falhou')}</Texto>
            <Botao
              variante="secundaria"
              larguraTotal
              titulo={t('relatorios.exportar.tentarDeNovo')}
              aoPressionar={() => {
                escolher(exportacao.formato);
              }}
            />
          </>
        ) : erro ? (
          <>
            <Texto cor={limite ? 'texto' : 'perigo'} accessibilityRole="alert">
              {mensagemDeErro(erro, t('relatorios.exportar.semConexao'))}
            </Texto>
            {limite ? (
              <Botao
                larguraTotal
                titulo={t('relatorios.exportar.verPlanos')}
                aoPressionar={() => {
                  fechar();
                  router.push('/planos');
                }}
              />
            ) : null}
          </>
        ) : (
          <>
            <Texto cor="suave">{t('relatorios.exportar.ajuda')}</Texto>
            <Botao
              variante="secundaria"
              icone="file-text"
              larguraTotal
              titulo={t('relatorios.exportar.pdf')}
              aoPressionar={() => {
                escolher('pdf');
              }}
            />
            <Botao
              variante="secundaria"
              icone="sheet"
              larguraTotal
              titulo={t('relatorios.exportar.xlsx')}
              aoPressionar={() => {
                escolher('xlsx');
              }}
            />
          </>
        )}
      </View>
    </Folha>
  );
}
