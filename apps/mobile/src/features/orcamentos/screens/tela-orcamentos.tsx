import {
  type Competencia,
  competenciaDe,
  ehCompetencia,
  ultimoDiaDaCompetencia,
} from '@mony/shared/datas';
import {
  type FaixaOrcamento,
  faixaDoOrcamento,
  type ListaOrcamentos,
  type Orcamento,
  percentualDoOrcamento,
} from '@mony/shared/orcamentos';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { useCategorias } from '@/features/categorias/hooks/use-categorias';
import { mesVizinho } from '@/features/transacoes/lib/periodo';
import { useMesCapitalizado, useNomeDoMes } from '@/lib/datas-texto';
import { useHoje } from '@/lib/fuso';
import {
  AnelProgresso,
  BarraProgresso,
  Botao,
  BotaoIcone,
  Cabecalho,
  Card,
  Erro,
  Etiqueta,
  Icone,
  SeletorMes,
  Skeleton,
  Tela,
  Texto,
  useTextoDoValor,
  Valor,
  Vazio,
} from '@/ui';
import { cores } from '@/ui/tokens';

import { FolhaOrcamento } from '../components/folha-orcamento';
import { useOrcamentos } from '../hooks/use-orcamentos';

/** `mony://orcamentos?competencia=2026-10` (alerta de orçamento) ou `2026-10-01`. */
function competenciaDoLink(texto: string | undefined): Competencia | null {
  if (texto === undefined) return null;
  const completa = /^\d{4}-\d{2}$/.test(texto) ? `${texto}-01` : texto;
  return ehCompetencia(completa) ? completa : null;
}

/** "Outubro · faltam 22 dias" no mês de hoje; nos outros, se já fechou ou ainda vem. */
function useLinhaDoMes(competencia: Competencia): string {
  const { t } = useTranslation();
  const hoje = useHoje();
  const mesCapitalizado = useMesCapitalizado();
  const mes = mesCapitalizado(competencia);
  const mesDeHoje = competenciaDe(hoje);
  if (competencia < mesDeHoje) return t('orcamentos.resumo.encerrado', { mes });
  if (competencia > mesDeHoje) return t('orcamentos.resumo.futuro', { mes });
  const dias = Number(ultimoDiaDaCompetencia(competencia).slice(8, 10)) - Number(hoje.slice(8, 10));
  if (dias === 0) return t('orcamentos.resumo.ultimoDia', { mes });
  if (dias === 1) return t('orcamentos.resumo.faltaUm', { mes });
  return t('orcamentos.resumo.faltam', { mes, dias });
}

function ResumoDoMes({ lista }: { lista: ListaOrcamentos }) {
  const { t } = useTranslation();
  const hoje = useHoje();
  const textoDoValor = useTextoDoValor();
  const linha = useLinhaDoMes(lista.competencia);
  const { valorLimiteCentavos, gastoCentavos } = lista.totais;
  const percentual = percentualDoOrcamento(gastoCentavos, valorLimiteCentavos);
  const faixa = faixaDoOrcamento(percentual);
  // A projeção só faz sentido no mês de hoje; nos outros ela é o próprio gasto (RN-061).
  const noMesDeHoje = lista.competencia === competenciaDe(hoje);
  const projecao = lista.itens.reduce((total, item) => total + item.projecaoCentavos, 0);
  return (
    <Card className="flex-row items-center gap-4">
      <AnelProgresso
        feitos={Math.min(percentual, 100)}
        total={100}
        tamanho={80}
        cor={cores[faixa]}
        rotulo={t('orcamentos.resumo.rotuloAnel', { percentual: String(percentual) })}
        conteudo={
          <View className="items-center">
            <Texto variante="titulo" className="font-negrito" testID="orcamentos-percentual">
              {`${String(percentual)}%`}
            </Texto>
            <Texto variante="legenda" cor="suave">
              {t('orcamentos.resumo.usado')}
            </Texto>
          </View>
        }
      />
      <View className="flex-1 gap-1">
        <Texto variante="corpo-sm" cor="suave" className="font-forte">
          {linha}
        </Texto>
        <Valor centavos={gastoCentavos} variante="titulo-lg" testID="orcamentos-gasto" />
        <Texto variante="corpo-sm" cor="suave">
          {t('orcamentos.resumo.planejado', { total: textoDoValor(valorLimiteCentavos) })}
        </Texto>
        {noMesDeHoje ? (
          <Etiqueta
            alinhamento="inicio"
            tom={projecao > valorLimiteCentavos ? 'atencao' : 'primaria'}
            texto={t('orcamentos.resumo.projecao', { valor: textoDoValor(projecao) })}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** O selo do item: quanto passou, o percentual em destaque ou só o percentual (RN-062). */
function SeloDoItem({ orcamento }: { orcamento: Orcamento }) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const percentual = t('orcamentos.item.percentual', {
    percentual: String(orcamento.percentualUsado),
  });
  if (orcamento.restanteCentavos < 0) {
    return (
      <Etiqueta
        tom="perigo"
        texto={t('orcamentos.item.passou', {
          valor: textoDoValor(Math.abs(orcamento.restanteCentavos)),
        })}
      />
    );
  }
  const tom: Record<FaixaOrcamento, 'perigo' | 'atencao' | null> = {
    estourado: 'perigo',
    atencao: 'atencao',
    normal: null,
  };
  const destaque = tom[orcamento.faixa];
  if (destaque !== null) return <Etiqueta tom={destaque} texto={percentual} />;
  return (
    <Texto variante="corpo-sm" className="font-forte">
      {percentual}
    </Texto>
  );
}

interface PropsItem {
  orcamento: Orcamento;
  categoria: string;
  primeiro: boolean;
  /** No modo de edição, o item abre a folha. */
  aoEditar?: () => void;
}

function ItemOrcamento({ orcamento, categoria, primeiro, aoEditar }: PropsItem) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const conteudo = (
    <>
      <View className="flex-row items-center justify-between gap-2">
        <Texto className="flex-1 font-forte" numberOfLines={1}>
          {categoria}
        </Texto>
        <SeloDoItem orcamento={orcamento} />
        {aoEditar ? <Icone nome="pencil" tamanho={16} cor={cores['texto-suave']} /> : null}
      </View>
      <BarraProgresso
        percentual={orcamento.percentualUsado}
        rotulo={t('orcamentos.item.rotulo', {
          categoria,
          percentual: String(orcamento.percentualUsado),
        })}
      />
      <Texto variante="corpo-sm" cor="suave">
        {t('orcamentos.item.valores', {
          gasto: textoDoValor(orcamento.gastoCentavos),
          limite: textoDoValor(orcamento.valorLimiteCentavos),
        })}
      </Texto>
    </>
  );
  const classe = primeiro ? 'gap-2 py-3' : 'gap-2 border-t border-borda py-3';
  if (!aoEditar) {
    return (
      <View className={classe} testID={`orcamento-${orcamento.id}`}>
        {conteudo}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={categoria}
      accessibilityHint={t('orcamentos.item.editarDica')}
      onPress={aoEditar}
      className={`${classe} active:opacity-70`}
      testID={`orcamento-${orcamento.id}`}
    >
      {conteudo}
    </Pressable>
  );
}

/**
 * Orçamentos do mês (design, página 5): o anel com o quanto do planejado já foi, o gasto, a
 * projeção (RN-061) e cada categoria com a barra pela faixa (RN-062). O lápis liga a edição: tocar
 * no item muda ou tira o orçamento (RN-060). Aberta por `mony://orcamentos?competencia=AAAA-MM`.
 */
export default function TelaOrcamentos() {
  const { t } = useTranslation();
  const router = useRouter();
  const hoje = useHoje();
  const nomeDoMes = useNomeDoMes();
  const { competencia: doLink } = useLocalSearchParams<{ competencia?: string }>();
  const [competencia, definirCompetencia] = useState(
    () => competenciaDoLink(doLink) ?? competenciaDe(hoje),
  );
  const [editando, definirEditando] = useState(false);
  // `undefined`: folha fechada; `null`: orçamento novo.
  const [aberto, definirAberto] = useState<Orcamento | null | undefined>(undefined);
  const consulta = useOrcamentos(competencia);
  const categorias = useCategorias();

  const despesas = (categorias.data?.itens ?? []).filter(({ tipo }) => tipo === 'despesa');
  const nomeDe = (categoriaId: string) =>
    despesas.find(({ id }) => id === categoriaId)?.nome ?? t('orcamentos.item.semCategoria');
  const itens = consulta.data?.itens ?? [];
  const semOrcamento = despesas.filter(
    ({ id }) => !itens.some(({ categoriaId }) => categoriaId === id),
  );

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Tela className="gap-3 px-4 pt-2">
      <Cabecalho
        titulo={t('orcamentos.titulo')}
        aoVoltar={voltar}
        acao={
          itens.length > 0 ? (
            <BotaoIcone
              icone={editando ? 'check' : 'pencil'}
              comFundo
              rotulo={editando ? t('orcamentos.pronto') : t('orcamentos.editar')}
              aoPressionar={() => {
                definirEditando(!editando);
              }}
            />
          ) : undefined
        }
      />
      <SeletorMes
        competencia={competencia}
        aoMudar={(passo) => {
          definirCompetencia(mesVizinho(competencia, passo));
        }}
      />
      {consulta.isPending ? (
        <View className="gap-4">
          <Skeleton altura={120} />
          <Skeleton altura={200} />
        </View>
      ) : consulta.isError ? (
        <Erro aoTentarDeNovo={() => void consulta.refetch()} />
      ) : consulta.data.itens.length === 0 ? (
        <Card>
          <Vazio
            titulo={t('orcamentos.vazio.titulo', { mes: nomeDoMes(competencia) })}
            descricao={t('orcamentos.vazio.descricao')}
            acao={{
              titulo: t('orcamentos.adicionar'),
              aoPressionar: () => {
                definirAberto(null);
              },
            }}
          />
        </Card>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
          <ResumoDoMes lista={consulta.data} />
          <Card className="py-1">
            {consulta.data.itens.map((orcamento, indice) => (
              <ItemOrcamento
                key={orcamento.id}
                orcamento={orcamento}
                categoria={nomeDe(orcamento.categoriaId)}
                primeiro={indice === 0}
                aoEditar={
                  editando
                    ? () => {
                        definirAberto(orcamento);
                      }
                    : undefined
                }
              />
            ))}
          </Card>
          <Botao
            variante="secundaria"
            titulo={t('orcamentos.adicionar')}
            larguraTotal
            aoPressionar={() => {
              definirAberto(null);
            }}
          />
        </ScrollView>
      )}

      {aberto === undefined ? null : (
        <FolhaOrcamento
          competencia={competencia}
          orcamento={aberto}
          categorias={aberto === null ? semOrcamento : despesas}
          aoFechar={() => {
            definirAberto(undefined);
          }}
        />
      )}
    </Tela>
  );
}
