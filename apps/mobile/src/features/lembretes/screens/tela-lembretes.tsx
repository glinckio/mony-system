import type { Lembrete } from '@mony/shared/lembretes';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';

import { useFusoDoUsuario, useHoje } from '@/lib/fuso';
import {
  BotaoIcone,
  Cabecalho,
  Card,
  Erro,
  Logo,
  Segmentado,
  Skeleton,
  Tela,
  Texto,
  Vazio,
} from '@/ui';
import { cores } from '@/ui/tokens';

import { ItemLembrete } from '../components/item-lembrete';
import { useLembretes } from '../hooks/use-lembretes';
import { agruparProximos } from '../lib/agenda';

type Aba = 'proximos' | 'recorrentes' | 'feitos';
const ABAS: readonly Aba[] = ['proximos', 'recorrentes', 'feitos'];

/** "Peça no chat" no fim da lista (design, página 6). */
function DicaDoChat() {
  const { t } = useTranslation();
  return (
    <Card className="flex-row items-center gap-3" testID="lembretes-dica">
      <View
        className="items-center justify-center rounded-total bg-claro"
        style={{ width: 32, height: 32 }}
      >
        <Logo tipo="marca" tamanho={18} />
      </View>
      <Texto variante="corpo-sm" className="flex-1">
        {t('lembretes.dicaMony')}
      </Texto>
    </Card>
  );
}

/**
 * Lembretes (design, página 6; RN-075): Próximos (os que tocaram e esperam o [Feito], hoje,
 * amanhã e os próximos dias), Recorrentes e Feitos. Tocar abre o lembrete; o "+" cria um novo.
 * O calendário do design (a agenda) entra com a T-085.
 */
export default function TelaLembretes() {
  const { t } = useTranslation();
  const router = useRouter();
  const fuso = useFusoDoUsuario();
  const hoje = useHoje();
  const [aba, definirAba] = useState<Aba>('proximos');
  const ativos = useLembretes('ativo');
  const feitos = useLembretes('concluido', aba === 'feitos');
  const consulta = aba === 'feitos' ? feitos : ativos;

  function novo() {
    router.push('/lembretes/novo');
  }

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const abrir = (lembrete: Lembrete) => () => {
    router.push({ pathname: '/lembretes/[id]', params: { id: lembrete.id } });
  };

  function conteudo() {
    if (consulta.isPending) {
      return (
        <View className="gap-3">
          <Skeleton altura={64} />
          <Skeleton altura={64} />
        </View>
      );
    }
    if (consulta.isError) return <Erro aoTentarDeNovo={() => void consulta.refetch()} />;
    const itens =
      aba === 'recorrentes'
        ? consulta.data.itens.filter(({ recorrencia }) => recorrencia !== null)
        : consulta.data.itens;
    if (itens.length === 0) {
      return (
        <Card>
          <Vazio
            titulo={t(`lembretes.vazio.${aba}`)}
            descricao={t('lembretes.vazio.descricao')}
            acao={{ titulo: t('lembretes.novo'), aoPressionar: novo }}
          />
        </Card>
      );
    }
    if (aba !== 'proximos') {
      return itens.map((lembrete) => (
        <ItemLembrete
          key={lembrete.id}
          lembrete={lembrete}
          fuso={fuso}
          bloco="data"
          aoAbrir={abrir(lembrete)}
        />
      ));
    }
    return agruparProximos(itens, hoje, fuso).map((grupo) => (
      <View key={grupo.chave} className="gap-2" testID={`grupo-${grupo.chave}`}>
        <Texto variante="corpo-sm" cor="suave" className="font-forte" accessibilityRole="header">
          {t(`lembretes.grupos.${grupo.chave}`)}
        </Texto>
        {grupo.itens.map((lembrete) => (
          <ItemLembrete
            key={lembrete.id}
            lembrete={lembrete}
            fuso={fuso}
            bloco={grupo.chave === 'pendentes' || grupo.chave === 'hoje' ? 'hora' : 'data'}
            aoAbrir={abrir(lembrete)}
          />
        ))}
      </View>
    ));
  }

  return (
    <Tela className="gap-3 px-4 pt-2">
      <Cabecalho
        titulo={t('lembretes.titulo')}
        aoVoltar={voltar}
        acao={<BotaoIcone icone="plus" comFundo rotulo={t('lembretes.novo')} aoPressionar={novo} />}
      />
      <Segmentado
        rotulo={t('lembretes.abasRotulo')}
        opcoes={ABAS.map((valor) => ({ valor, rotulo: t(`lembretes.abas.${valor}`) }))}
        selecionado={aba}
        aoEscolher={definirAba}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 pb-6"
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor={cores.texto}
            onRefresh={() => {
              void consulta.refetch();
            }}
          />
        }
      >
        {conteudo()}
        {aba === 'feitos' ? null : <DicaDoChat />}
      </ScrollView>
    </Tela>
  );
}
