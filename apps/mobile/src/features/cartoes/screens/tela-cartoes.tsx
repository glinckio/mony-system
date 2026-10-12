import type { Cartao, Fatura } from '@mony/shared/cartoes';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { useDataCurta, useMesCapitalizado, useNomeDoMes } from '@/lib/datas-texto';
import {
  BarraProgresso,
  Botao,
  BotaoIcone,
  Cabecalho,
  Card,
  Erro,
  juntarClasses,
  Skeleton,
  Tela,
  Texto,
  useTextoDoValor,
  Valor,
  Vazio,
} from '@/ui';

import { CartaoVisual } from '../components/cartao-visual';
import { EtiquetaFatura } from '../components/etiqueta-fatura';
import { FolhaPagarFatura } from '../components/folha-pagar-fatura';
import { useCartoes, useFaturasDoCartao } from '../hooks/use-cartoes';

const ESPACO_ENTRE_CARTOES = 12;

/** "50%, 80% e 100%". */
function juntarFaixas(faixas: readonly number[]): string {
  const textos = [...faixas].sort((a, b) => a - b).map((faixa) => `${String(faixa)}%`);
  if (textos.length <= 1) return textos.join('');
  return `${textos.slice(0, -1).join(', ')} e ${textos.at(-1) ?? ''}`;
}

function ResumoLimite({ cartao }: { cartao: Cartao }) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const acima = cartao.limiteDisponivelCentavos < 0;
  const total = textoDoValor(cartao.limiteTotalCentavos);
  return (
    <Card className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Texto cor="suave" className="font-forte">
          {t('cartoes.limite.usado')}
        </Texto>
        <View className="flex-row items-center gap-1">
          <Texto variante="corpo-sm" cor={acima ? 'perigo' : 'suave'} className="font-forte">
            {acima ? t('cartoes.limite.acima') : t('cartoes.limite.disponivel')}
          </Texto>
          <Valor
            centavos={Math.abs(cartao.limiteDisponivelCentavos)}
            variante="corpo-sm"
            tipo={acima ? 'despesa' : 'neutro'}
            testID="limite-disponivel"
          />
        </View>
      </View>
      <View className="flex-row items-baseline gap-2">
        <Valor centavos={cartao.limiteUsadoCentavos} variante="titulo-lg" testID="limite-usado" />
        <Texto cor="suave" className="font-forte">
          {t('cartoes.limite.de', { total })}
        </Texto>
      </View>
      <BarraProgresso
        percentual={cartao.percentualUsado}
        rotulo={t('cartoes.limite.rotuloBarra', { nome: cartao.nome })}
      />
      <Texto variante="corpo-sm" cor="suave" className="font-forte">
        {cartao.faixasAlerta.length === 0
          ? t('cartoes.limite.alertasDesligados')
          : t('cartoes.limite.alertas', { faixas: juntarFaixas(cartao.faixasAlerta) })}
      </Texto>
    </Card>
  );
}

function FaturaAtual({ cartao, aoPagar }: { cartao: Cartao; aoPagar: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const nomeDoMes = useNomeDoMes();
  const dataCurta = useDataCurta();
  const fatura = cartao.faturaAtual;
  return (
    <Card className="gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Texto cor="suave" className="font-forte" accessibilityRole="header">
            {t('cartoes.fatura.titulo', { mes: nomeDoMes(fatura.competencia) })}
          </Texto>
          <Valor
            centavos={fatura.valorTotalCentavos}
            variante="titulo-lg"
            testID="fatura-atual-total"
          />
        </View>
        <EtiquetaFatura status={fatura.status} />
      </View>
      <Texto cor="suave">
        {t('cartoes.fatura.datas', {
          fechamento: dataCurta(fatura.dataFechamento),
          vencimento: dataCurta(fatura.dataVencimento),
        })}
      </Texto>
      {fatura.venceNoFimDeSemana ? (
        <Texto variante="corpo-sm" cor="atencao">
          {t('cartoes.fatura.fimDeSemana')}
        </Texto>
      ) : null}
      {fatura.id !== null && fatura.saldoCentavos > 0 ? (
        <Botao titulo={t('cartoes.fatura.pagar')} larguraTotal aoPressionar={aoPagar} />
      ) : null}
      {fatura.id === null ? null : (
        <Botao
          variante="fantasma"
          titulo={t('cartoes.fatura.ver')}
          aoPressionar={() => {
            router.push({
              pathname: '/cartoes/[id]/faturas/[faturaId]',
              params: { id: cartao.id, faturaId: fatura.id ?? '' },
            });
          }}
        />
      )}
    </Card>
  );
}

function ProximasFaturas({ cartao, faturas }: { cartao: Cartao; faturas: readonly Fatura[] }) {
  const { t } = useTranslation();
  const mesCapitalizado = useMesCapitalizado();
  const proximas = faturas
    .filter((fatura) => fatura.competencia > cartao.faturaAtual.competencia)
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
    .slice(0, 3);
  if (proximas.length === 0) return null;
  return (
    <Card className="gap-3">
      <Texto cor="suave" className="font-forte" accessibilityRole="header">
        {t('cartoes.fatura.proximas')}
      </Texto>
      <View className="flex-row gap-3">
        {proximas.map((fatura) => (
          <View key={fatura.id} className="flex-1 gap-0.5">
            <Texto variante="corpo-sm" cor="suave">
              {mesCapitalizado(fatura.competencia)}
            </Texto>
            <Valor centavos={fatura.valorTotalCentavos} variante="corpo-sm" />
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * Aba Cartões (design, página 4): os cartões em carrossel e, do escolhido, o limite (RN-034), a
 * fatura atual com "Marcar fatura como paga" (RN-036) e as próximas faturas. Aberta por
 * `/cartoes/<id>` (link da notificação), já mostra aquele cartão.
 */
export default function TelaCartoes() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id: inicial } = useLocalSearchParams<{ id?: string }>();
  const { width } = useWindowDimensions();
  const consulta = useCartoes();
  const cartoes = consulta.data?.itens ?? [];
  const [escolhido, definirEscolhido] = useState<string | undefined>(inicial);
  const [pagando, definirPagando] = useState(false);

  const cartao = cartoes.find((item) => item.id === escolhido) ?? cartoes[0];
  const faturas = useFaturasDoCartao(cartao?.id);
  const larguraCartao = Math.min(360, width - 64);

  function novo() {
    router.push('/cartoes/novo');
  }

  return (
    <Tela className="gap-4 pt-2">
      <View className="px-4">
        <Cabecalho
          titulo={t('cartoes.titulo')}
          acao={<BotaoIcone icone="plus" comFundo rotulo={t('cartoes.novo')} aoPressionar={novo} />}
        />
      </View>
      {consulta.isPending ? (
        <View className="gap-4 px-4">
          <Skeleton altura={180} />
          <Skeleton altura={120} />
        </View>
      ) : consulta.isError ? (
        <Erro aoTentarDeNovo={() => void consulta.refetch()} />
      ) : cartao === undefined ? (
        <View className="px-4">
          <Card>
            <Vazio
              titulo={t('cartoes.vazio.titulo')}
              descricao={t('cartoes.vazio.descricao')}
              acao={{ titulo: t('cartoes.vazio.acao'), aoPressionar: novo }}
            />
          </Card>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
          <View className="gap-2">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={larguraCartao + ESPACO_ENTRE_CARTOES}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: 16, gap: ESPACO_ENTRE_CARTOES }}
              onMomentumScrollEnd={(evento) => {
                const indice = Math.round(
                  evento.nativeEvent.contentOffset.x / (larguraCartao + ESPACO_ENTRE_CARTOES),
                );
                const naPosicao = cartoes[indice];
                if (naPosicao) definirEscolhido(naPosicao.id);
              }}
            >
              {cartoes.map((item) => (
                <CartaoVisual
                  key={item.id}
                  cartao={item}
                  largura={larguraCartao}
                  selecionado={item.id === cartao.id}
                  aoPressionar={() => {
                    definirEscolhido(item.id);
                  }}
                />
              ))}
            </ScrollView>
            {cartoes.length > 1 ? (
              <View
                className="flex-row justify-center gap-1.5"
                importantForAccessibility="no-hide-descendants"
              >
                {cartoes.map((item) => (
                  <View
                    key={item.id}
                    className={juntarClasses(
                      'h-1.5 rounded-total',
                      item.id === cartao.id ? 'bg-claro' : 'bg-vidro-forte',
                    )}
                    style={{ width: item.id === cartao.id ? 18 : 6 }}
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View className="gap-4 px-4">
            <ResumoLimite cartao={cartao} />
            <FaturaAtual
              cartao={cartao}
              aoPagar={() => {
                definirPagando(true);
              }}
            />
            <ProximasFaturas cartao={cartao} faturas={faturas.data?.itens ?? []} />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Botao
                  variante="secundaria"
                  icone="list"
                  titulo={t('cartoes.fatura.todas')}
                  larguraTotal
                  aoPressionar={() => {
                    router.push({ pathname: '/cartoes/[id]/faturas', params: { id: cartao.id } });
                  }}
                />
              </View>
              <View className="flex-1">
                <Botao
                  variante="secundaria"
                  icone="pencil"
                  titulo={t('cartoes.editar')}
                  larguraTotal
                  aoPressionar={() => {
                    router.push({ pathname: '/cartoes/[id]/editar', params: { id: cartao.id } });
                  }}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      )}

      {pagando && cartao?.faturaAtual.id ? (
        <FolhaPagarFatura
          fatura={{ ...cartao.faturaAtual, id: cartao.faturaAtual.id }}
          contaSugerida={cartao.contaPagamentoId}
          aoFechar={() => {
            definirPagando(false);
          }}
        />
      ) : null}
    </Tela>
  );
}
