import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { useMesCapitalizado } from '@/lib/datas-texto';
import { useHoje } from '@/lib/fuso';
import { BotaoIcone, Cabecalho, Card, Erro, Icone, Segmentado, Skeleton, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { BarrasDias } from '../components/barras-dias';
import { EvolucaoAnual } from '../components/evolucao-anual';
import { FolhaExportar } from '../components/folha-exportar';
import { GraficoMensal } from '../components/grafico-mensal';
import { ListaBarras } from '../components/lista-barras';
import { RoscaCategorias } from '../components/rosca-categorias';
import {
  useRelatorioAnual,
  useRelatorioCartoes,
  useRelatorioCategorias,
  useRelatorioDiasDaSemana,
  useRelatorioFormas,
  useRelatorioMensal,
} from '../hooks/use-relatorios';
import { ABAS_RELATORIO, type AbaRelatorio, periodoDaAba, periodoDosAnos } from '../lib/periodos';

/**
 * Relatórios (design, página 6; RN-150): Mês, 6 meses e Ano. Receitas × despesas por mês, despesas
 * por categoria, por dia da semana, por cartão e por forma de pagamento; no Ano, também a evolução
 * dos últimos cinco anos. O botão de baixar exporta o período da aba em PDF ou planilha (RN-151).
 * No fim, o atalho para o histórico de preços dos cupons fiscais (T-066c).
 */
export default function TelaRelatorios() {
  const { t } = useTranslation();
  const router = useRouter();
  const hoje = useHoje();
  const mesCapitalizado = useMesCapitalizado();
  const [aba, definirAba] = useState<AbaRelatorio>('seis');
  const [exportando, definirExportando] = useState(false);
  const periodo = periodoDaAba(aba, hoje);
  const mensal = useRelatorioMensal(periodo);
  const categorias = useRelatorioCategorias(periodo);
  const dias = useRelatorioDiasDaSemana(periodo);
  const cartoes = useRelatorioCartoes(periodo);
  const formas = useRelatorioFormas(periodo);
  const anual = useRelatorioAnual(periodoDosAnos(hoje), aba === 'ano');
  const consultas = [mensal, categorias, dias, cartoes, formas];

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Tela className="gap-3 px-4 pt-2">
      <Cabecalho
        titulo={t('relatorios.titulo')}
        aoVoltar={voltar}
        acao={
          <BotaoIcone
            icone="download"
            rotulo={t('relatorios.exportar.botao')}
            aoPressionar={() => {
              definirExportando(true);
            }}
          />
        }
      />
      <Segmentado
        rotulo={t('relatorios.periodo')}
        opcoes={ABAS_RELATORIO.map((valor) => ({ valor, rotulo: t(`relatorios.abas.${valor}`) }))}
        selecionado={aba}
        aoEscolher={definirAba}
      />
      {consultas.some((consulta) => consulta.isError && consulta.data === undefined) ? (
        <Erro
          aoTentarDeNovo={() => {
            for (const consulta of consultas) void consulta.refetch();
          }}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 pb-6"
          refreshControl={
            <RefreshControl
              refreshing={false}
              tintColor={cores.texto}
              onRefresh={() => {
                for (const consulta of consultas) void consulta.refetch();
                if (aba === 'ano') void anual.refetch();
              }}
            />
          }
        >
          {mensal.data ? <GraficoMensal relatorio={mensal.data} /> : <Skeleton altura={240} />}
          {categorias.data ? (
            <RoscaCategorias
              relatorio={categorias.data}
              rotuloCentro={
                aba === 'mes'
                  ? mesCapitalizado(periodo.inicio)
                  : t('relatorios.categorias.centroPeriodo')
              }
            />
          ) : (
            <Skeleton altura={150} />
          )}
          {dias.data ? <BarrasDias relatorio={dias.data} /> : <Skeleton altura={140} />}
          {cartoes.data ? (
            <ListaBarras
              titulo={t('relatorios.cartoes.titulo')}
              vazio={t('relatorios.cartoes.vazio')}
              testID="relatorio-cartoes"
              itens={cartoes.data.itens.map((item) => ({
                chave: item.cartaoId,
                nome: item.nome,
                cor: item.cor,
                totalCentavos: item.totalCentavos,
                quantidade: item.quantidade,
              }))}
            />
          ) : null}
          {formas.data ? (
            <ListaBarras
              titulo={t('relatorios.formas.titulo')}
              vazio={t('relatorios.formas.vazio')}
              testID="relatorio-formas"
              itens={formas.data.itens.map((item) => ({
                chave: item.formaPagamento,
                nome: t(`transacoes.formas.${item.formaPagamento}`),
                totalCentavos: item.totalCentavos,
                quantidade: item.quantidade,
              }))}
            />
          ) : null}
          {aba === 'ano' ? (
            anual.data ? (
              <EvolucaoAnual relatorio={anual.data} />
            ) : (
              <View>
                <Skeleton altura={160} />
              </View>
            )
          ) : null}
          <Card className="p-0">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('relatorios.precos.titulo')}
              accessibilityHint={t('relatorios.precos.atalho')}
              onPress={() => {
                router.push('/relatorios/precos');
              }}
              className="min-h-toque flex-row items-center gap-3 p-4 active:opacity-70"
            >
              <Icone nome="receipt" tamanho={20} cor={cores.link} />
              <View className="flex-1">
                <Texto className="font-forte">{t('relatorios.precos.titulo')}</Texto>
                <Texto variante="legenda" cor="suave">
                  {t('relatorios.precos.atalho')}
                </Texto>
              </View>
              <Icone nome="chevron-right" tamanho={18} cor={cores['texto-suave']} />
            </Pressable>
          </Card>
        </ScrollView>
      )}
      <FolhaExportar
        visivel={exportando}
        periodo={periodo}
        aoFechar={() => {
          definirExportando(false);
        }}
      />
    </Tela>
  );
}
