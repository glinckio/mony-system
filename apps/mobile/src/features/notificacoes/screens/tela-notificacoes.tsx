import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import type { Notificacao } from '@mony/shared/notificacoes';
import type { Novidade } from '@mony/shared/notificacoes';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Linking, Pressable, View } from 'react-native';

import {
  useLerNovidades,
  useMarcarLida,
  useMarcarTodas,
  useNotificacoes,
  useNovidades,
} from '@/features/notificacoes/hooks/use-notificacoes';
import { useDataCurta } from '@/lib/datas-texto';
import { useFusoDoUsuario } from '@/lib/fuso';
import { rotaDoLink } from '@/lib/links-internos';
import { Botao, Cabecalho, Icone, juntarClasses, Segmentado, Tela, Texto, Vazio } from '@/ui';
import { cores } from '@/ui/tokens';

type Filtro = 'todas' | 'naoLidas';
type Aba = 'alertas' | 'novidades';

/**
 * Central de notificações (doc 09): a aba Alertas (T-087) e a aba Novidades (T-150). O push de uma
 * novidade abre direto nela (`mony://notificacoes?aba=novidades`).
 */
export default function TelaNotificacoes() {
  const { t } = useTranslation();
  const router = useRouter();
  const parametros = useLocalSearchParams<{ aba?: string }>();
  const [aba, definirAba] = useState<Aba>(parametros.aba === 'novidades' ? 'novidades' : 'alertas');
  const novidades = useNovidades();
  const novidadesNaoLidas = novidades.data?.naoLidas ?? 0;

  return (
    <Tela className="px-4 pt-2">
      <Cabecalho
        titulo={t('notificacoes.titulo')}
        aoVoltar={() => {
          router.back();
        }}
      />
      <View className="pt-2">
        <Segmentado
          rotulo={t('notificacoes.abas')}
          opcoes={[
            { valor: 'alertas', rotulo: t('notificacoes.abaAlertas') },
            {
              valor: 'novidades',
              rotulo:
                novidadesNaoLidas > 0
                  ? t('notificacoes.abaNovidadesNovas', { quantidade: novidadesNaoLidas })
                  : t('notificacoes.abaNovidades'),
            },
          ]}
          selecionado={aba}
          aoEscolher={definirAba}
        />
      </View>
      {aba === 'alertas' ? <AbaAlertas /> : <AbaNovidades />}
    </Tela>
  );
}

/**
 * Os alertas (T-087): da mais nova para a mais antiga, as não lidas com o ponto. Tocar marca como
 * lida e abre a tela do link (RN-105); "Marcar todas como lidas" limpa o ponto do sino do Início.
 */
function AbaAlertas() {
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
    <View className="flex-1">
      <View className="gap-3 pb-3 pt-3">
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
    </View>
  );
}

/**
 * As novidades no ar (T-150): o que estava sem ler quando a aba abriu ganha o selo "Nova" e já
 * conta como lida, porque o texto inteiro está no cartão. O vídeo abre no app do YouTube ou do
 * Vimeo (ou no navegador).
 */
function AbaNovidades() {
  const { t } = useTranslation();
  const lista = useNovidades();
  const { mutate: lerNovidades } = useLerNovidades();
  const [novasAoAbrir, definirNovasAoAbrir] = useState<ReadonlySet<string> | null>(null);
  const itens = lista.data?.itens;
  // Na primeira lista que chega, guarda quais eram novas (o selo fica até sair da aba).
  if (itens !== undefined && novasAoAbrir === null) {
    definirNovasAoAbrir(new Set(itens.filter(({ lida }) => !lida).map(({ id }) => id)));
  }

  useEffect(() => {
    if (novasAoAbrir !== null && novasAoAbrir.size > 0) lerNovidades([...novasAoAbrir]);
  }, [novasAoAbrir, lerNovidades]);

  if (lista.isPending) return <ActivityIndicator className="pt-3" color={cores.texto} />;
  if (lista.isError) {
    return (
      <View className="items-start gap-2 pt-3">
        <Texto cor="perigo">{t('notificacoes.novidades.erro')}</Texto>
        <Botao
          variante="secundaria"
          compacto
          titulo={t('notificacoes.tentarDeNovo')}
          aoPressionar={() => void lista.refetch()}
        />
      </View>
    );
  }
  if (lista.data.itens.length === 0) return <Vazio titulo={t('notificacoes.novidades.vazia')} />;
  return (
    <FlatList
      data={lista.data.itens}
      keyExtractor={({ id }) => id}
      contentContainerClassName="gap-2 pb-8 pt-3"
      renderItem={({ item }) => (
        <ItemNovidade novidade={item} nova={novasAoAbrir?.has(item.id) ?? !item.lida} />
      )}
    />
  );
}

function ItemNovidade({ novidade, nova }: { novidade: Novidade; nova: boolean }) {
  const { t } = useTranslation();
  const fuso = useFusoDoUsuario();
  const dataCurta = useDataCurta();
  const publicada = new Date(novidade.publicadaEm);
  return (
    <View
      testID="novidade"
      accessibilityLabel={
        nova ? t('notificacoes.novidades.nova', { titulo: novidade.titulo }) : undefined
      }
      className={juntarClasses(
        'gap-2 rounded-md p-3',
        nova ? 'bg-superficie-alta' : 'bg-superficie',
      )}
    >
      <View className="flex-row items-center gap-2">
        {nova ? (
          <View className="rounded-total bg-atencao px-2">
            <Texto variante="legenda" className="font-forte">
              {t('notificacoes.novidades.selo')}
            </Texto>
          </View>
        ) : null}
        <Texto variante="legenda" cor="fraco">
          {dataCurta(dataNoFuso(publicada, fuso))}
        </Texto>
      </View>
      <Texto className="font-forte">{novidade.titulo}</Texto>
      <Texto variante="corpo-sm" cor="suave">
        {novidade.descricao}
      </Texto>
      {novidade.videoUrl !== null ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('notificacoes.novidades.assistir', { titulo: novidade.titulo })}
          onPress={() => {
            if (novidade.videoUrl !== null) void Linking.openURL(novidade.videoUrl);
          }}
          className="min-h-toque flex-row items-center gap-2 self-start active:opacity-70"
        >
          <Icone nome="circle-play" tamanho={22} cor={cores.texto} />
          <Texto>{t('notificacoes.novidades.video')}</Texto>
        </Pressable>
      ) : null}
    </View>
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
