import type { TipoConta } from '@mony/shared/enums';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import {
  BotaoIcone,
  Cabecalho,
  Card,
  Erro,
  Icone,
  type NomeIcone,
  Skeleton,
  Tela,
  Texto,
  Valor,
  Vazio,
} from '@/ui';
import { cores } from '@/ui/tokens';

import { useContas } from '../hooks/use-contas';

export const ICONE_DO_TIPO: Record<TipoConta, NomeIcone> = {
  corrente: 'landmark',
  poupanca: 'piggy-bank',
  carteira: 'wallet',
};

/**
 * Contas e carteiras (sem design próprio, no visual do app): nome, tipo e o saldo atual que a API
 * calcula (doc 05). As do banco (Open Finance) vêm marcadas.
 */
export default function TelaContas() {
  const { t } = useTranslation();
  const router = useRouter();
  const consulta = useContas();
  const contas = consulta.data?.itens ?? [];

  function nova() {
    router.push('/mais/contas/nova');
  }

  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('contas.titulo')}
        aoVoltar={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/mais');
        }}
        acao={<BotaoIcone icone="plus" comFundo rotulo={t('contas.nova')} aoPressionar={nova} />}
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
        {consulta.isPending ? (
          <Card className="gap-4">
            <Skeleton altura={40} />
            <Skeleton altura={40} />
          </Card>
        ) : consulta.isError ? (
          <Erro aoTentarDeNovo={() => void consulta.refetch()} />
        ) : contas.length === 0 ? (
          <Card>
            <Vazio
              titulo={t('contas.vazio')}
              descricao={t('contas.vazioDescricao')}
              acao={{ titulo: t('contas.nova'), aoPressionar: nova }}
            />
          </Card>
        ) : (
          <Card className="px-2 py-1">
            {contas.map((conta, indice) => {
              const tipo = t(`contas.tipos.${conta.tipo}`);
              const detalhes =
                conta.origem === 'open_finance' ? `${tipo} · ${t('contas.doBanco')}` : tipo;
              return (
                <Pressable
                  key={conta.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${conta.nome}, ${detalhes}`}
                  onPress={() => {
                    router.push({ pathname: '/mais/contas/[id]', params: { id: conta.id } });
                  }}
                  className={
                    indice === 0
                      ? 'min-h-toque flex-row items-center gap-3 px-2 py-3 active:opacity-70'
                      : 'min-h-toque flex-row items-center gap-3 border-t border-borda px-2 py-3 active:opacity-70'
                  }
                >
                  <View className="h-10 w-10 items-center justify-center rounded-total bg-vidro">
                    <Icone nome={ICONE_DO_TIPO[conta.tipo]} cor={cores.texto} />
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Texto className="font-forte">{conta.nome}</Texto>
                    <Texto variante="corpo-sm" cor="suave">
                      {detalhes}
                    </Texto>
                  </View>
                  <Valor
                    centavos={conta.saldoAtualCentavos}
                    tipo={conta.saldoAtualCentavos < 0 ? 'despesa' : 'neutro'}
                    testID={`saldo-${conta.id}`}
                  />
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </Tela>
  );
}
