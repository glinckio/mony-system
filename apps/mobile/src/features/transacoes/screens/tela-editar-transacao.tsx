import { ErroApi } from '@mony/api-client';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BotaoIcone, Erro, Skeleton, Tela } from '@/ui';

import { FormularioTransacao } from '../components/formulario-transacao';
import { useTransacao } from '../hooks/use-transacoes';

/**
 * Editar um lançamento (rota `/transacoes/<id>`, também aberta pelo link `mony://transacoes/<id>`
 * das notificações). Abre na hora quando a lista já tem o lançamento.
 */
export default function TelaEditarTransacao() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useTransacao(id);

  if (consulta.data) return <FormularioTransacao key={consulta.data.id} original={consulta.data} />;

  const naoEncontrado = consulta.error instanceof ErroApi && consulta.error.status === 404;
  return (
    <Tela className="gap-4 p-4">
      <View className="min-h-botao flex-row items-center">
        <BotaoIcone
          icone="chevron-left"
          rotulo={t('transacoes.formulario.voltar')}
          aoPressionar={() => {
            router.dismissTo('/transacoes');
          }}
        />
      </View>
      {consulta.isError ? (
        <Erro
          mensagem={naoEncontrado ? t('transacoes.formulario.naoEncontrado') : undefined}
          aoTentarDeNovo={naoEncontrado ? undefined : () => void consulta.refetch()}
        />
      ) : (
        <View className="gap-4">
          <Skeleton altura={50} />
          <Skeleton altura={50} />
          <Skeleton altura={50} />
        </View>
      )}
    </Tela>
  );
}
