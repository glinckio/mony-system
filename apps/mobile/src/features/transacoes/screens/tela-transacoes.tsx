import { competenciaDe } from '@mony/shared/datas';
import type { Transacao } from '@mony/shared/transacoes';
import { useRouter } from 'expo-router';
import { type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, SectionList, View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { useHoje } from '@/lib/fuso';
import { useValorAtrasado } from '@/lib/use-valor-atrasado';
import {
  Botao,
  BotaoIcone,
  CampoBusca,
  Chip,
  Erro,
  Folha,
  Skeleton,
  Tela,
  Texto,
  Vazio,
} from '@/ui';
import { cores, espacos } from '@/ui/tokens';

import { FolhaFiltros } from '../components/folha-filtros';
import { GrupoOpcoes } from '../components/grupo-opcoes';
import { ItemTransacao } from '../components/item-transacao';
import { ResumoTotais } from '../components/resumo-totais';
import { SeletorMes } from '../components/seletor-mes';
import { useLoteTransacoes } from '../hooks/use-mutacoes';
import {
  useDetalhesDoItem,
  useNomeDoMes,
  useRotuloDoDia,
  useValorFalado,
} from '../hooks/use-textos';
import { useCatalogos, useListaTransacoes, useTotais } from '../hooks/use-transacoes';
import {
  aplicarAtalho,
  aplicarFolha,
  ATALHOS,
  atalhoAtivo,
  type FiltroDaTela,
  filtrosDaFolha,
  parametrosDoFiltro,
  quantosFiltrosNaFolha,
  temFiltro,
} from '../lib/filtro';
import { agruparPorDia, mesVizinho } from '../lib/periodo';

/** Espera depois da última letra antes de buscar. */
const ATRASO_BUSCA_MS = 350;

type FolhaAberta = 'filtros' | 'categoria' | 'excluir' | null;

/**
 * Aba Transações (design, página 4): mês, busca, filtros da RN-047, totais do filtro e a lista por
 * dia. Tocar abre o lançamento; segurar começa a seleção múltipla, que muda a categoria ou exclui
 * vários de uma vez (RN-044).
 */
export default function TelaTransacoes() {
  const { t } = useTranslation();
  const router = useRouter();
  const hoje = useHoje();
  const [filtro, definirFiltro] = useState<FiltroDaTela>(() => ({
    competencia: competenciaDe(hoje),
    texto: '',
  }));
  const [busca, definirBusca] = useState('');
  const textoBuscado = useValorAtrasado(busca, ATRASO_BUSCA_MS);
  const [selecionados, definirSelecionados] = useState<ReadonlySet<string>>(new Set());
  const [folha, definirFolha] = useState<FolhaAberta>(null);

  const filtroAtual: FiltroDaTela = { ...filtro, texto: textoBuscado };
  const parametros = parametrosDoFiltro(filtroAtual);
  const lista = useListaTransacoes(parametros);
  const totais = useTotais(parametros);
  const catalogos = useCatalogos();
  const lote = useLoteTransacoes();

  const rotuloDoDia = useRotuloDoDia();
  const nomeDoMes = useNomeDoMes();
  const detalhesDoItem = useDetalhesDoItem(catalogos);
  const valorFalado = useValorFalado();

  const itens = lista.data?.pages.flatMap(({ itens: daPagina }) => daPagina) ?? [];
  const porId = new Map(itens.map((item) => [item.id, item]));
  const categorias = new Map(catalogos.categorias.map((item) => [item.id, item]));
  const secoes = agruparPorDia(itens).map(({ data, itens: doDia }) => ({
    chave: data,
    titulo: rotuloDoDia(data),
    data: doDia,
  }));

  const idsSelecionados = [...selecionados].filter((id) => porId.has(id));
  const selecionando = idsSelecionados.length > 0;
  const tiposSelecionados = new Set(idsSelecionados.map((id) => porId.get(id)?.tipo));
  const [tipoSelecionado] = tiposSelecionados;
  const filtrosNaFolha = quantosFiltrosNaFolha(filtroAtual);
  const atalho = atalhoAtivo(filtroAtual);

  function sairDaSelecao() {
    definirSelecionados(new Set());
    definirFolha(null);
    lote.reset();
  }

  function mudarFiltro(novo: FiltroDaTela) {
    definirFiltro(novo);
    definirSelecionados(new Set());
  }

  function alternarSelecao(id: string) {
    definirSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function tocarItem(transacao: Transacao) {
    if (selecionando) alternarSelecao(transacao.id);
    else router.push({ pathname: '/transacoes/[id]', params: { id: transacao.id } });
  }

  function limparFiltros() {
    definirBusca('');
    mudarFiltro({ competencia: filtro.competencia, texto: '' });
  }

  let vazio: ReactElement;
  if (lista.isPending) {
    vazio = (
      <View className="gap-4 p-3">
        <Skeleton largura="40%" />
        <Skeleton altura={40} />
        <Skeleton altura={40} />
      </View>
    );
  } else if (lista.isError) {
    vazio = <Erro aoTentarDeNovo={() => void lista.refetch()} />;
  } else if (temFiltro(filtroAtual)) {
    vazio = (
      <Vazio
        titulo={t('transacoes.vazio.filtro')}
        descricao={t('transacoes.vazio.filtroDescricao')}
        acao={{ titulo: t('transacoes.vazio.limpar'), aoPressionar: limparFiltros }}
      />
    );
  } else {
    vazio = (
      <Vazio
        titulo={t('transacoes.vazio.mes', { mes: nomeDoMes(filtro.competencia) })}
        descricao={t('transacoes.vazio.mesDescricao')}
        acao={{
          titulo: t('transacoes.novo'),
          aoPressionar: () => {
            router.push('/transacoes/nova');
          },
        }}
      />
    );
  }

  const erroLote = lote.isError ? mensagemDeErro(lote.error, t('transacoes.semConexao')) : null;

  return (
    <Tela className="gap-3 px-4 pt-2">
      {selecionando ? (
        <View className="min-h-botao flex-row items-center gap-1">
          <BotaoIcone
            icone="x"
            rotulo={t('transacoes.selecao.sair')}
            aoPressionar={sairDaSelecao}
          />
          <Texto variante="titulo" accessibilityRole="header" className="flex-1">
            {idsSelecionados.length === 1
              ? t('transacoes.selecao.tituloUm')
              : t('transacoes.selecao.titulo', { quantidade: idsSelecionados.length })}
          </Texto>
          <BotaoIcone
            icone="tag"
            comFundo
            rotulo={t('transacoes.selecao.mudarCategoria')}
            aoPressionar={() => {
              lote.reset();
              definirFolha('categoria');
            }}
          />
          <BotaoIcone
            icone="trash"
            comFundo
            cor="perigo"
            rotulo={t('transacoes.selecao.excluir')}
            aoPressionar={() => {
              lote.reset();
              definirFolha('excluir');
            }}
          />
        </View>
      ) : (
        <View className="min-h-botao flex-row items-center justify-between">
          <Texto variante="titulo-lg" accessibilityRole="header">
            {t('transacoes.titulo')}
          </Texto>
          <BotaoIcone
            icone="plus"
            comFundo
            rotulo={t('transacoes.novo')}
            aoPressionar={() => {
              router.push('/transacoes/nova');
            }}
          />
        </View>
      )}

      <View className="flex-row items-center gap-2">
        <CampoBusca rotulo={t('transacoes.buscar')} valor={busca} aoMudar={definirBusca} />
        <BotaoIcone
          icone="list-filter"
          comFundo
          cor={filtrosNaFolha > 0 ? 'link' : 'texto'}
          rotulo={
            filtrosNaFolha === 0
              ? t('transacoes.filtros')
              : filtrosNaFolha === 1
                ? t('transacoes.filtrosUmAtivo')
                : t('transacoes.filtrosAtivos', { quantidade: filtrosNaFolha })
          }
          aoPressionar={() => {
            definirFolha('filtros');
          }}
        />
      </View>

      <SeletorMes
        competencia={filtro.competencia}
        aoMudar={(passo) => {
          mudarFiltro({ ...filtro, competencia: mesVizinho(filtro.competencia, passo) });
        }}
      />

      <ResumoTotais totais={totais.data} />

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 py-1.5">
            {ATALHOS.map((valor) => (
              <Chip
                key={valor}
                rotulo={t(`transacoes.atalhos.${valor}`)}
                selecionado={atalho === valor}
                aoPressionar={() => {
                  mudarFiltro(aplicarAtalho(filtro, valor));
                }}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <View className="-mx-1 flex-1 overflow-hidden rounded-t-lg bg-superficie">
        <SectionList
          testID="lista-transacoes"
          sections={secoes}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: espacos['2'], paddingBottom: espacos['6'] }}
          renderSectionHeader={({ section }) => (
            <Texto
              variante="corpo-sm"
              cor="suave"
              accessibilityRole="header"
              className="px-2 pb-1 pt-3 font-forte"
            >
              {section.titulo}
            </Texto>
          )}
          renderItem={({ item }) => (
            <ItemTransacao
              transacao={item}
              categoria={categorias.get(item.categoriaId)}
              detalhes={detalhesDoItem(item)}
              valorFalado={valorFalado(item)}
              selecionando={selecionando}
              selecionado={selecionados.has(item.id)}
              aoTocar={() => {
                tocarItem(item);
              }}
              aoSegurar={() => {
                alternarSelecao(item.id);
              }}
            />
          )}
          ListEmptyComponent={vazio}
          ListFooterComponent={
            lista.isFetchingNextPage ? (
              <ActivityIndicator
                className="py-4"
                color={cores.texto}
                accessibilityLabel={t('transacoes.carregandoMais')}
              />
            ) : null
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (lista.hasNextPage && !lista.isFetchingNextPage) void lista.fetchNextPage();
          }}
          refreshControl={
            <RefreshControl
              refreshing={lista.isRefetching && !lista.isFetchingNextPage}
              onRefresh={() => {
                void lista.refetch();
                void totais.refetch();
              }}
              tintColor={cores.texto}
            />
          }
        />
      </View>

      {folha === 'filtros' ? (
        <FolhaFiltros
          inicial={filtrosDaFolha(filtro)}
          catalogos={catalogos}
          aoFechar={() => {
            definirFolha(null);
          }}
          aoAplicar={(escolhidos) => {
            mudarFiltro(aplicarFolha(filtro, escolhidos));
            definirFolha(null);
          }}
        />
      ) : null}

      <Folha
        visivel={folha === 'categoria'}
        titulo={t('transacoes.selecao.escolherCategoria')}
        aoFechar={() => {
          definirFolha(null);
        }}
      >
        {tiposSelecionados.size > 1 || tipoSelecionado === undefined ? (
          <Texto cor="suave">{t('transacoes.selecao.tiposMisturados')}</Texto>
        ) : (
          <GrupoOpcoes
            titulo={t('transacoes.folhaFiltros.categoria')}
            selecionado={null}
            desabilitado={lote.isPending}
            opcoes={catalogos.categorias
              .filter((item) => item.tipo === tipoSelecionado)
              .map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
            aoEscolher={(categoriaId) => {
              lote.mutate(
                { acao: 'mudar_categoria', ids: idsSelecionados, categoriaId },
                { onSuccess: sairDaSelecao },
              );
            }}
          />
        )}
        {erroLote === null ? null : (
          <Texto cor="perigo" accessibilityRole="alert">
            {erroLote}
          </Texto>
        )}
      </Folha>

      <Folha
        visivel={folha === 'excluir'}
        titulo={
          idsSelecionados.length === 1
            ? t('transacoes.selecao.confirmarExclusaoUm')
            : t('transacoes.selecao.confirmarExclusao', { quantidade: idsSelecionados.length })
        }
        aoFechar={() => {
          definirFolha(null);
        }}
        rodape={
          <>
            <Botao
              variante="perigo"
              larguraTotal
              titulo={t('transacoes.selecao.confirmar')}
              carregando={lote.isPending}
              aoPressionar={() => {
                lote.mutate(
                  { acao: 'excluir', ids: idsSelecionados },
                  { onSuccess: sairDaSelecao },
                );
              }}
            />
            <Botao
              variante="fantasma"
              titulo={t('transacoes.selecao.cancelar')}
              aoPressionar={() => {
                definirFolha(null);
              }}
            />
          </>
        }
      >
        <Texto cor="suave">{t('transacoes.selecao.explicacaoExclusao')}</Texto>
        {erroLote === null ? null : (
          <Texto cor="perigo" accessibilityRole="alert">
            {erroLote}
          </Texto>
        )}
      </Folha>
    </Tela>
  );
}
