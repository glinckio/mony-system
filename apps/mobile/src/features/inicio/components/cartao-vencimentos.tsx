import type { Vencimento } from '@mony/shared/dashboard';
import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useDataCurta } from '@/lib/datas-texto';
import { useHoje } from '@/lib/fuso';
import { Card, Icone, type NomeIcone, Texto, Valor } from '@/ui';
import { cores } from '@/ui/tokens';

import { TituloCard } from './titulo-card';

/** Quantos o Início mostra; a lista da API vai até 30 dias para a frente. */
const MAXIMO = 5;

const ICONE_DO_TIPO: Record<Vencimento['tipo'], NomeIcone> = {
  fatura: 'credit-card',
  parcela: 'receipt',
  conta: 'calendar',
};

/** Fatura abre a fatura; parcela e conta, o lançamento delas. */
function destino(vencimento: Vencimento): Href | null {
  if (vencimento.tipo === 'fatura' && vencimento.cartaoId !== null) {
    return {
      pathname: '/cartoes/[id]/faturas/[faturaId]',
      params: { id: vencimento.cartaoId, faturaId: vencimento.id },
    };
  }
  if (vencimento.transacaoId !== null) {
    return { pathname: '/transacoes/[id]', params: { id: vencimento.transacaoId } };
  }
  return null;
}

/** RN-023: faturas, parcelas e contas a pagar, dos atrasados aos dos próximos 30 dias. */
export function CartaoVencimentos({ vencimentos }: { vencimentos: readonly Vencimento[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const hoje = useHoje();
  const dataCurta = useDataCurta();
  return (
    <View>
      <TituloCard titulo={t('inicio.vencimentos.titulo')} />
      <Card className="mt-2 px-4 py-1">
        {vencimentos.length === 0 ? (
          <Texto cor="suave" className="py-3">
            {t('inicio.vencimentos.vazio')}
          </Texto>
        ) : (
          vencimentos.slice(0, MAXIMO).map((vencimento, indice) => {
            const rota = destino(vencimento);
            const quando = vencimento.atrasado
              ? t('inicio.vencimentos.atrasado', { data: dataCurta(vencimento.vencimento) })
              : vencimento.vencimento === hoje
                ? t('inicio.vencimentos.venceHoje')
                : t('inicio.vencimentos.vence', { data: dataCurta(vencimento.vencimento) });
            return (
              <Pressable
                key={`${vencimento.tipo}-${vencimento.id}`}
                accessibilityRole={rota ? 'button' : undefined}
                accessibilityLabel={`${vencimento.descricao}, ${quando}`}
                disabled={rota === null}
                onPress={() => {
                  if (rota) router.push(rota);
                }}
                className={
                  indice === 0
                    ? 'min-h-toque flex-row items-center gap-3 py-2 active:opacity-70'
                    : 'min-h-toque flex-row items-center gap-3 border-t border-borda py-2 active:opacity-70'
                }
              >
                <Icone
                  nome={ICONE_DO_TIPO[vencimento.tipo]}
                  tamanho={18}
                  cor={vencimento.atrasado ? cores.perigo : cores['texto-suave']}
                />
                <View className="flex-1">
                  <Texto numberOfLines={1}>{vencimento.descricao}</Texto>
                  <Texto variante="corpo-sm" cor={vencimento.atrasado ? 'perigo' : 'suave'}>
                    {quando}
                  </Texto>
                </View>
                <Valor centavos={vencimento.valorCentavos} />
              </Pressable>
            );
          })
        )}
      </Card>
    </View>
  );
}
