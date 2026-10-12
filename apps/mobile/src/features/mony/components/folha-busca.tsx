import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useBuscaMony } from '@/features/mony/hooks/use-conversa-mony';
import { useDataCurta } from '@/lib/datas-texto';
import { useValorAtrasado } from '@/lib/use-valor-atrasado';
import { CampoBusca, cores, Folha, Texto } from '@/ui';

/** Espera depois da última letra antes de buscar. */
const ATRASO_BUSCA_MS = 300;

interface PropsFolhaBusca {
  visivel: boolean;
  aoFechar: () => void;
}

/** Busca no histórico da Mony (doc 04, T-069): as mensagens que têm o texto, da mais nova. */
export function FolhaBusca({ visivel, aoFechar }: PropsFolhaBusca) {
  const { t } = useTranslation();
  const dataCurta = useDataCurta();
  const [texto, definirTexto] = useState('');
  const buscado = useValorAtrasado(texto, ATRASO_BUSCA_MS);
  const busca = useBuscaMony(buscado);
  const itens = busca.data?.itens ?? [];
  return (
    <Folha
      visivel={visivel}
      titulo={t('mony.busca.titulo')}
      aoFechar={() => {
        definirTexto('');
        aoFechar();
      }}
    >
      <View className="gap-3">
        <View className="flex-row">
          <CampoBusca rotulo={t('mony.busca.campo')} valor={texto} aoMudar={definirTexto} />
        </View>
        {buscado.trim().length < 2 ? (
          <Texto cor="suave">{t('mony.busca.ajuda')}</Texto>
        ) : busca.isPending ? (
          <ActivityIndicator color={cores.texto} />
        ) : busca.isError ? (
          <Texto cor="perigo">{t('mony.busca.erro')}</Texto>
        ) : itens.length === 0 ? (
          <Texto cor="suave">{t('mony.busca.vazia')}</Texto>
        ) : (
          itens.map((mensagem) => (
            <View
              key={mensagem.id}
              className="gap-1 rounded-md bg-superficie-alta p-3"
              testID="mony-resultado-busca"
            >
              <Texto variante="corpo-sm" cor="suave">
                {`${t(mensagem.autor === 'mony' ? 'mony.busca.mony' : 'mony.busca.voce')} · ${dataCurta(mensagem.criadoEm.slice(0, 10))}`}
              </Texto>
              <Texto>{mensagem.conteudo ?? ''}</Texto>
            </View>
          ))
        )}
      </View>
    </Folha>
  );
}
