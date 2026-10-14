import { competenciaDe } from '@mony/shared/datas';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { useMesAnoCurto, useNomeDoMes } from '@/lib/datas-texto';
import { useValorAtrasado } from '@/lib/use-valor-atrasado';
import { Cabecalho, CampoBusca, Erro, Skeleton, Tela, Texto, Vazio } from '@/ui';

import { ItemPreco } from '../components/item-preco';
import { buscaDePrecoValida, useHistoricoPrecos } from '../hooks/use-relatorios';

/** Espera depois da última letra antes de buscar. */
const ATRASO_BUSCA_MS = 350;

/**
 * Histórico de preços (RN-150, T-066c), aberto pelos Relatórios: busca um produto nos itens dos
 * cupons fiscais (NFC-e) lidos pela Mony e mostra, por produto, o último preço pago, o menor e a
 * média por loja. O período é o padrão da API: os últimos 12 meses (no gratuito, o mês atual).
 */
export default function TelaPrecos() {
  const { t } = useTranslation();
  const router = useRouter();
  const mesAnoCurto = useMesAnoCurto();
  const nomeDoMes = useNomeDoMes();
  const [busca, definirBusca] = useState('');
  const buscado = useValorAtrasado(busca, ATRASO_BUSCA_MS);
  const precos = useHistoricoPrecos(buscado);
  const valida = buscaDePrecoValida(busca) && buscaDePrecoValida(buscado);

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/relatorios');
  }

  function conteudo() {
    if (!valida) {
      return (
        <Vazio
          titulo={t('relatorios.precos.inicioTitulo')}
          descricao={t('relatorios.precos.inicioAjuda')}
        />
      );
    }
    if (precos.isError && precos.data === undefined) {
      return <Erro aoTentarDeNovo={() => void precos.refetch()} />;
    }
    if (!precos.data) {
      return (
        <View className="gap-3">
          <Skeleton altura={150} />
          <Skeleton altura={150} />
        </View>
      );
    }
    const { inicio, fim, itens, busca: buscaFeita } = precos.data;
    if (itens.length === 0) {
      return (
        <Vazio
          titulo={t('relatorios.precos.vazioTitulo', { busca: buscaFeita })}
          descricao={t('relatorios.precos.vazioAjuda')}
        />
      );
    }
    return (
      <>
        <Texto variante="legenda" cor="suave" testID="precos-periodo">
          {competenciaDe(inicio) === competenciaDe(fim)
            ? t('relatorios.precos.periodoMes', { mes: nomeDoMes(inicio) })
            : t('relatorios.precos.periodo', {
                inicio: mesAnoCurto(inicio),
                fim: mesAnoCurto(fim),
              })}
        </Texto>
        {itens.map((produto, indice) => (
          <ItemPreco
            key={`${produto.descricao}|${produto.unidade}`}
            produto={produto}
            testID={`preco-${String(indice)}`}
          />
        ))}
      </>
    );
  }

  return (
    <Tela className="gap-3 px-4 pt-2">
      <Cabecalho titulo={t('relatorios.precos.titulo')} aoVoltar={voltar} />
      <View className="flex-row">
        <CampoBusca
          rotulo={t('relatorios.precos.buscar')}
          valor={busca}
          aoMudar={definirBusca}
          testID="precos-busca"
        />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        {conteudo()}
      </ScrollView>
    </Tela>
  );
}
