import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import type { Notificacao } from '@mony/shared/notificacoes';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';

import {
  useMarcarLida,
  useMarcarTodas,
  useNotificacoes,
} from '@/features/notificacoes/hooks/use-notificacoes';
import { useDataCurta } from '@/lib/datas-texto';
import { useFusoDoUsuario } from '@/lib/fuso';
import { rotaDoLink } from '@/lib/links-internos';
import { Botao, Cabecalho, juntarClasses, Segmentado, Tela, Texto, Vazio } from '@/ui';
import { cores } from '@/ui/tokens';

type Filtro = 'todas' | 'naoLidas';

/**
 * Central de notificações (doc 09, T-087): da mais nova para a mais antiga, as não lidas com o
 * ponto. Tocar marca como lida e abre a tela do link (RN-105); "Marcar todas como lidas" limpa o
 * ponto do sino do Início.
 */
export default function TelaNotificacoes() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filtro, definirFiltro] = useState<Filtro>('todas');
  const lista = useNotificacoes(filtro === 'naoLidas');
  const marcarLida = useMarcarLida();
  const marcarTodas = useMarcarTodas();
  const itens = (lista.data?.pages ?? []).flatMap(({ itens: pagina }) => pagina);
  const naoLidas = lista.data?.pages[0]?.naoLidas ?? 0;

  function abrir(notificacao: Notificacao) {
    if (notificacao.lidaEm === null) marcarLida.mutate(notificacao.id);
    const rota = rotaDoLink(notificacao.linkInterno);
    if (rota !== null) router.push(rota);
  }

  return (
    <Tela className="px-4 pt-2">
      <Cabecalho
        titulo={t('notificacoes.titulo')}
        aoVoltar={() => {
          router.back();
        }}
      />
      <View className="gap-3 pb-3 pt-2">
        <Segmentado
          rotulo={t('notificacoes.filtro')}
          opcoes={[
            { valor: 'todas', rotulo: t('notificacoes.todas') },
            { valor: 'naoLidas', rotulo: t('notificacoes.naoLidas') },
          ]}
          selecionado={filtro}
          aoEscolher={definirFiltro}
        />
        {naoLidas > 0 ? (
          <Botao
            variante="fantasma"
            compacto
            titulo={t('notificacoes.marcarTodas')}
            carregando={marcarTodas.isPending}
            aoPressionar={() => {
              marcarTodas.mutate();
            }}
          />
        ) : null}
      </View>
      {lista.isPending ? (
        <ActivityIndicator color={cores.texto} />
      ) : lista.isError ? (
        <View className="items-start gap-2">
          <Texto cor="perigo">{t('notificacoes.erro')}</Texto>
          <Botao
            variante="secundaria"
            compacto
            titulo={t('notificacoes.tentarDeNovo')}
            aoPressionar={() => void lista.refetch()}
          />
        </View>
      ) : itens.length === 0 ? (
        <Vazio
          titulo={t(filtro === 'naoLidas' ? 'notificacoes.vaziaNaoLidas' : 'notificacoes.vazia')}
        />
      ) : (
        <FlatList
          data={itens}
          keyExtractor={({ id }) => id}
          contentContainerClassName="gap-2 pb-8"
          renderItem={({ item }) => <ItemNotificacao notificacao={item} aoAbrir={abrir} />}
          onEndReached={() => {
            if (lista.hasNextPage && !lista.isFetchingNextPage) void lista.fetchNextPage();
          }}
          ListFooterComponent={
            lista.isFetchingNextPage ? <ActivityIndicator color={cores.texto} /> : null
          }
        />
      )}
    </Tela>
  );
}

function ItemNotificacao({
  notificacao,
  aoAbrir,
}: {
  notificacao: Notificacao;
  aoAbrir: (notificacao: Notificacao) => void;
}) {
  const { t } = useTranslation();
  const fuso = useFusoDoUsuario();
  const dataCurta = useDataCurta();
  const criada = new Date(notificacao.criadoEm);
  const naoLida = notificacao.lidaEm === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        naoLida ? t('notificacoes.naoLida', { titulo: notificacao.titulo }) : notificacao.titulo
      }
      onPress={() => {
        aoAbrir(notificacao);
      }}
      testID="notificacao"
      className={juntarClasses(
        'flex-row gap-3 rounded-md p-3 active:opacity-70',
        naoLida ? 'bg-superficie-alta' : 'bg-superficie',
      )}
    >
      <View className="w-2 items-center pt-2">
        {naoLida ? <View className="h-2 w-2 rounded-total bg-atencao" /> : null}
      </View>
      <View className="flex-1 gap-1">
        <Texto className={naoLida ? 'font-forte' : undefined}>{notificacao.titulo}</Texto>
        <Texto variante="corpo-sm" cor="suave">
          {notificacao.corpo}
        </Texto>
        <Texto variante="legenda" cor="fraco">
          {t('notificacoes.quando', {
            data: dataCurta(dataNoFuso(criada, fuso)),
            hora: horaNoFuso(criada, fuso),
          })}
        </Texto>
      </View>
    </Pressable>
  );
}
