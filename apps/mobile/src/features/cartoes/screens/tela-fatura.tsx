import { ErroApi } from '@mony/api-client';
import type { Transacao } from '@mony/shared/transacoes';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { dataParaTexto } from '@/features/transacoes/lib/periodo';
import { useDataCurta, useNomeDoMes } from '@/lib/datas-texto';
import { Botao, Cabecalho, Card, Erro, Skeleton, Tela, Texto, Valor } from '@/ui';

import { EtiquetaFatura } from '../components/etiqueta-fatura';
import { FolhaPagarFatura } from '../components/folha-pagar-fatura';
import { useCartoes, useFatura } from '../hooks/use-cartoes';

function Linha({ transacao, aoTocar }: { transacao: Transacao; aoTocar: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={transacao.descricao}
      onPress={aoTocar}
      className="min-h-toque flex-row items-center gap-3 border-t border-borda py-3 active:opacity-70"
    >
      <View className="flex-1 gap-0.5">
        <Texto className="font-forte" numberOfLines={1}>
          {transacao.descricao}
        </Texto>
        <Texto variante="corpo-sm" cor="suave">
          {dataParaTexto(transacao.data)}
        </Texto>
      </View>
      <Valor centavos={transacao.valorCentavos} />
    </Pressable>
  );
}

/**
 * Detalhe da fatura (`/cartoes/<id>/faturas/<id>`, também pelo link da notificação): total, pago,
 * saldo, datas, as compras e os pagamentos. Tocar numa compra abre o lançamento.
 */
export default function TelaFatura() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, faturaId } = useLocalSearchParams<{ id: string; faturaId: string }>();
  const consulta = useFatura(faturaId);
  const cartoes = useCartoes();
  const nomeDoMes = useNomeDoMes();
  const dataCurta = useDataCurta();
  const [pagando, definirPagando] = useState(false);
  const detalhe = consulta.data;

  function voltar() {
    router.dismissTo({ pathname: '/cartoes/[id]', params: { id } });
  }

  function abrir(transacao: Transacao) {
    router.push({ pathname: '/transacoes/[id]', params: { id: transacao.id } });
  }

  if (!detalhe) {
    const naoEncontrada = consulta.error instanceof ErroApi && consulta.error.status === 404;
    return (
      <Tela className="gap-4 px-4 pt-2">
        <Cabecalho titulo={t('cartoes.titulo')} aoVoltar={voltar} />
        {consulta.isError ? (
          <Erro
            mensagem={naoEncontrada ? t('cartoes.fatura.naoEncontrada') : undefined}
            aoTentarDeNovo={naoEncontrada ? undefined : () => void consulta.refetch()}
          />
        ) : (
          <View className="gap-4">
            <Skeleton altura={120} />
            <Skeleton altura={80} />
          </View>
        )}
      </Tela>
    );
  }

  const { fatura, cartao, transacoes, pagamentos } = detalhe;
  const contaSugerida =
    cartoes.data?.itens.find((item) => item.id === cartao.id)?.contaPagamentoId ?? null;

  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('cartoes.fatura.titulo', { mes: nomeDoMes(fatura.competencia) })}
        aoVoltar={voltar}
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <Texto cor="suave" className="font-forte">
              {cartao.nome}
            </Texto>
            <EtiquetaFatura status={fatura.status} />
          </View>
          <View className="flex-row gap-3">
            {(
              [
                ['total', fatura.valorTotalCentavos],
                ['pago', fatura.valorPagoCentavos],
                ['saldo', fatura.saldoCentavos],
              ] as const
            ).map(([chave, centavos]) => (
              <View key={chave} className="flex-1 gap-0.5">
                <Texto variante="legenda" cor="suave" className="font-forte">
                  {t(`cartoes.fatura.${chave}`)}
                </Texto>
                <Valor centavos={centavos} variante="corpo-sm" testID={`fatura-${chave}`} />
              </View>
            ))}
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
          {fatura.saldoCentavos > 0 ? (
            <Botao
              titulo={t('cartoes.fatura.pagar')}
              larguraTotal
              aoPressionar={() => {
                definirPagando(true);
              }}
            />
          ) : null}
        </Card>

        <Card className="gap-1">
          <Texto cor="suave" className="pb-1 font-forte" accessibilityRole="header">
            {t('cartoes.fatura.compras')}
          </Texto>
          {transacoes.length === 0 ? (
            <Texto cor="suave">{t('cartoes.fatura.semCompras')}</Texto>
          ) : (
            transacoes.map((transacao) => (
              <Linha
                key={transacao.id}
                transacao={transacao}
                aoTocar={() => {
                  abrir(transacao);
                }}
              />
            ))
          )}
        </Card>

        {pagamentos.length > 0 ? (
          <Card className="gap-1">
            <Texto cor="suave" className="pb-1 font-forte" accessibilityRole="header">
              {t('cartoes.fatura.pagamentos')}
            </Texto>
            {pagamentos.map((transacao) => (
              <Linha
                key={transacao.id}
                transacao={transacao}
                aoTocar={() => {
                  abrir(transacao);
                }}
              />
            ))}
          </Card>
        ) : null}
      </ScrollView>

      {pagando ? (
        <FolhaPagarFatura
          fatura={fatura}
          contaSugerida={contaSugerida}
          aoFechar={() => {
            definirPagando(false);
          }}
        />
      ) : null}
    </Tela>
  );
}
