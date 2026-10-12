import type { Meta } from '@mony/shared/metas';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { BotaoIcone, Cabecalho, Card, Erro, Skeleton, Tela, Texto, Valor, Vazio } from '@/ui';

import { CartaoMeta } from '../components/cartao-meta';
import { FolhaAporte } from '../components/folha-aporte';
import { useMetas } from '../hooks/use-metas';

/**
 * Metas (design, página 5): o total guardado em todas e cada meta com o percentual, a barra e
 * "Guardar" (RN-063). Abertas primeiro, pelo prazo, como a API manda.
 */
export default function TelaMetas() {
  const { t } = useTranslation();
  const router = useRouter();
  const consulta = useMetas();
  const [guardando, definirGuardando] = useState<Meta | null>(null);
  const metas = consulta.data?.itens ?? [];
  const guardado = metas.reduce((total, meta) => total + meta.valorAtualCentavos, 0);

  function nova() {
    router.push('/metas/nova');
  }

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('metas.titulo')}
        aoVoltar={voltar}
        acao={<BotaoIcone icone="plus" comFundo rotulo={t('metas.nova')} aoPressionar={nova} />}
      />
      {consulta.isPending ? (
        <View className="gap-4">
          <Skeleton altura={80} />
          <Skeleton altura={130} />
        </View>
      ) : consulta.isError ? (
        <Erro aoTentarDeNovo={() => void consulta.refetch()} />
      ) : metas.length === 0 ? (
        <Card>
          <Vazio
            titulo={t('metas.vazio.titulo')}
            descricao={t('metas.vazio.descricao')}
            acao={{ titulo: t('metas.nova'), aoPressionar: nova }}
          />
        </Card>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-3 pb-6">
          <View className="items-center gap-1 pb-2">
            <Texto variante="corpo-sm" cor="suave" className="font-forte">
              {t('metas.guardadoTotal')}
            </Texto>
            <Valor centavos={guardado} variante="titulo-xl" testID="metas-guardado" />
          </View>
          {metas.map((meta, indice) => (
            <CartaoMeta
              key={meta.id}
              meta={meta}
              indice={indice}
              aoAbrir={() => {
                router.push({ pathname: '/metas/[id]', params: { id: meta.id } });
              }}
              aoGuardar={() => {
                definirGuardando(meta);
              }}
            />
          ))}
        </ScrollView>
      )}

      {guardando === null ? null : (
        <FolhaAporte
          meta={guardando}
          aoFechar={() => {
            definirGuardando(null);
          }}
        />
      )}
    </Tela>
  );
}
