import type { ListaOrcamentos } from '@mony/shared/orcamentos';
import { percentualDoOrcamento } from '@mony/shared/orcamentos';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCategorias } from '@/features/categorias/hooks/use-categorias';
import { useNomeDoMes } from '@/lib/datas-texto';
import { BarraProgresso, Card, Texto, useTextoDoValor } from '@/ui';

import { TituloCard } from './titulo-card';

/** Quantas categorias o Início mostra: as mais perto de estourar. */
const MAXIMO = 3;

/**
 * Os orçamentos do mês no Início: o total gasto do planejado e as categorias mais usadas, com a
 * barra na cor da faixa (RN-062). O título abre a tela de orçamentos no mesmo mês.
 */
export function CartaoOrcamentos({ orcamentos }: { orcamentos: ListaOrcamentos }) {
  const { t } = useTranslation();
  const router = useRouter();
  const nomeDoMes = useNomeDoMes();
  const textoDoValor = useTextoDoValor();
  const categorias = useCategorias();
  const nomeDe = (id: string) =>
    categorias.data?.itens.find((categoria) => categoria.id === id)?.nome ?? '';
  const { gastoCentavos, valorLimiteCentavos } = orcamentos.totais;
  const percentual = percentualDoOrcamento(gastoCentavos, valorLimiteCentavos);
  const principais = [...orcamentos.itens]
    .sort((a, b) => b.percentualUsado - a.percentualUsado)
    .slice(0, MAXIMO);
  const titulo = t('inicio.orcamentos.titulo', { mes: nomeDoMes(orcamentos.competencia) });
  return (
    <View>
      <TituloCard
        titulo={titulo}
        aoAbrir={() => {
          router.push({
            pathname: '/orcamentos',
            params: { competencia: orcamentos.competencia.slice(0, 7) },
          });
        }}
      />
      <Card className="mt-2 gap-3">
        <View className="gap-1.5">
          <Texto className="font-forte">
            {t('inicio.orcamentos.total', {
              gasto: textoDoValor(gastoCentavos),
              limite: textoDoValor(valorLimiteCentavos),
            })}
          </Texto>
          <BarraProgresso percentual={percentual} rotulo={titulo} />
        </View>
        {principais.map((orcamento) => (
          <View key={orcamento.id} className="gap-1.5">
            <View className="flex-row justify-between gap-2">
              <Texto variante="corpo-sm" className="flex-1" numberOfLines={1}>
                {nomeDe(orcamento.categoriaId)}
              </Texto>
              <Texto variante="corpo-sm" cor="suave">
                {`${String(orcamento.percentualUsado)}%`}
              </Texto>
            </View>
            <BarraProgresso
              percentual={orcamento.percentualUsado}
              rotulo={nomeDe(orcamento.categoriaId)}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}
