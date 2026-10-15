import type { ResumoLista } from '@mony/shared/listas';
import { dataNoFuso } from '@mony/shared/datas';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { ConvitesRecebidos } from '@/features/compartilhamentos/components/convites-recebidos';
import { useCompartilhamentos } from '@/features/compartilhamentos/hooks/use-compartilhamentos';
import { useDataCurta } from '@/lib/datas-texto';
import { useFusoDoUsuario } from '@/lib/fuso';
import {
  BotaoIcone,
  Cabecalho,
  Card,
  Chip,
  Erro,
  Icone,
  Skeleton,
  Tela,
  Texto,
  Valor,
  Vazio,
} from '@/ui';
import { cores } from '@/ui/tokens';

import { useListas } from '../hooks/use-listas';
import { CATEGORIAS_NA_TELA, type FiltroListas, separarListas } from '../lib/listas';

const FILTROS: readonly FiltroListas[] = ['todas', ...CATEGORIAS_NA_TELA];

function CartaoLista({
  lista,
  fuso,
  aoAbrir,
}: {
  lista: ResumoLista;
  fuso: string;
  aoAbrir: () => void;
}) {
  const { t } = useTranslation();
  const dataCurta = useDataCurta();
  const detalhe =
    lista.finalizadaEm === null
      ? t('listas.progresso', {
          count: lista.quantidadeItens,
          comprados: lista.quantidadeComprados,
        })
      : t('listas.finalizadaEm', {
          data: dataCurta(dataNoFuso(new Date(lista.finalizadaEm), fuso)),
        });
  // RN-074: de quem é a lista recebida, ou com quantas pessoas a própria é dividida.
  const compartilhada =
    lista.dono !== null
      ? t('compartilhamentos.deOutro.lista', { nome: lista.dono.nome })
      : lista.compartilhadaCom > 0
        ? t('compartilhamentos.compartilhadaCom', { count: lista.compartilhadaCom })
        : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[lista.nome, detalhe, compartilhada].filter(Boolean).join(', ')}
      onPress={aoAbrir}
      className="active:opacity-70"
      testID={`lista-${lista.id}`}
    >
      <Card className="flex-row items-center gap-3">
        <View className="flex-1 gap-0.5">
          <Texto variante="titulo" numberOfLines={1}>
            {lista.nome}
          </Texto>
          <Texto variante="corpo-sm" cor="suave">
            {`${t(`listas.categorias.${lista.categoria}`)} · ${detalhe}`}
          </Texto>
          {compartilhada === null ? null : (
            <View className="flex-row items-center gap-1">
              <Icone nome="user" tamanho={14} cor={cores['texto-suave']} />
              <Texto variante="corpo-sm" cor="suave" numberOfLines={1}>
                {compartilhada}
              </Texto>
            </View>
          )}
        </View>
        <Valor centavos={lista.totalEstimadoCentavos} variante="corpo" />
        <Icone nome="chevron-right" tamanho={18} cor={cores['texto-suave']} />
      </Card>
    </Pressable>
  );
}

/**
 * Listas de compras (design, página 6; RN-070): os chips por tipo de lista, as abertas e as
 * últimas finalizadas. Tocar abre a lista; o "+" cria uma nova. No topo, os convites para listas
 * de outras pessoas; cada lista diz de quem é ou com quantas pessoas é dividida (RN-074).
 */
export default function TelaListas() {
  const { t } = useTranslation();
  const router = useRouter();
  const fuso = useFusoDoUsuario();
  const [filtro, definirFiltro] = useState<FiltroListas>('todas');
  const consulta = useListas();
  const compartilhamentos = useCompartilhamentos();

  function nova() {
    router.push('/listas/nova');
  }

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const abrir = (lista: ResumoLista) => () => {
    router.push({ pathname: '/listas/[id]', params: { id: lista.id } });
  };

  function conteudo() {
    if (consulta.isPending) {
      return (
        <View className="gap-3">
          <Skeleton altura={72} />
          <Skeleton altura={72} />
        </View>
      );
    }
    if (consulta.isError) return <Erro aoTentarDeNovo={() => void consulta.refetch()} />;
    const { abertas, finalizadas } = separarListas(consulta.data.itens, filtro);
    return (
      <>
        <ConvitesRecebidos recurso="lista" />
        {abertas.length === 0 ? (
          <Card>
            <Vazio
              titulo={
                filtro === 'todas'
                  ? t('listas.vazio.titulo')
                  : t('listas.vazio.categoria', {
                      categoria: t(`listas.categorias.${filtro}`).toLowerCase(),
                    })
              }
              descricao={t('listas.vazio.descricao')}
              acao={{ titulo: t('listas.nova'), aoPressionar: nova }}
            />
          </Card>
        ) : (
          abertas.map((lista) => (
            <CartaoLista key={lista.id} lista={lista} fuso={fuso} aoAbrir={abrir(lista)} />
          ))
        )}
        {finalizadas.length === 0 ? null : (
          <View className="gap-2" testID="listas-finalizadas">
            <Texto
              variante="corpo-sm"
              cor="suave"
              className="font-forte"
              accessibilityRole="header"
            >
              {t('listas.finalizadas')}
            </Texto>
            {finalizadas.map((lista) => (
              <CartaoLista key={lista.id} lista={lista} fuso={fuso} aoAbrir={abrir(lista)} />
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <Tela className="gap-3 px-4 pt-2">
      <Cabecalho
        titulo={t('listas.titulo')}
        aoVoltar={voltar}
        acao={<BotaoIcone icone="plus" comFundo rotulo={t('listas.nova')} aoPressionar={nova} />}
      />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            className="flex-row gap-2 py-1.5"
            accessibilityLabel={t('listas.filtroRotulo')}
            testID="filtros-listas"
          >
            {FILTROS.map((valor) => (
              <Chip
                key={valor}
                rotulo={valor === 'todas' ? t('listas.todas') : t(`listas.categorias.${valor}`)}
                selecionado={filtro === valor}
                aoPressionar={() => {
                  definirFiltro(valor);
                }}
              />
            ))}
          </View>
        </ScrollView>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 pb-6"
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor={cores.texto}
            onRefresh={() => {
              void consulta.refetch();
              void compartilhamentos.refetch();
            }}
          />
        }
      >
        {conteudo()}
      </ScrollView>
    </Tela>
  );
}
