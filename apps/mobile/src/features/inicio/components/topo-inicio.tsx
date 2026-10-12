import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useSessao } from '@/stores/sessao';
import { Avatar, BotaoIcone, Icone, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

interface PropsTopoInicio {
  notificacoesNaoLidas: number;
  aoEscolherPeriodo: () => void;
}

/**
 * O topo do Início (design, página 3): as iniciais (abrem o Perfil), a
 * busca (abre os lançamentos), o período e o sino com o ponto das notificações não lidas.
 */
export function TopoInicio({ notificacoesNaoLidas, aoEscolherPeriodo }: PropsTopoInicio) {
  const { t } = useTranslation();
  const router = useRouter();
  const nome = useSessao((estado) => estado.usuario?.nome ?? '');
  const avisoNotificacoes =
    notificacoesNaoLidas === 0
      ? t('inicio.notificacoes')
      : notificacoesNaoLidas === 1
        ? t('inicio.notificacaoNova')
        : t('inicio.notificacoesNovas', { quantidade: notificacoesNaoLidas });
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('inicio.perfil')}
        onPress={() => {
          router.push('/mais/perfil');
        }}
        className="active:opacity-70"
      >
        <Avatar nome={nome} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('inicio.pesquisar')}
        accessibilityHint={t('inicio.pesquisarDica')}
        onPress={() => {
          router.push('/transacoes');
        }}
        className="min-h-toque flex-1 flex-row items-center gap-2 rounded-total border border-vidro bg-vidro px-4 active:opacity-70"
      >
        <Icone nome="search" tamanho={18} cor={cores['texto-suave']} />
        <Texto cor="suave">{t('inicio.pesquisar')}</Texto>
      </Pressable>
      <BotaoIcone
        icone="calendar"
        comFundo
        rotulo={t('inicio.periodo.botao')}
        aoPressionar={aoEscolherPeriodo}
      />
      {/* Só aviso por enquanto: a central de notificações é a T-087. */}
      <View
        accessible
        accessibilityLabel={avisoNotificacoes}
        testID="inicio-notificacoes"
        className="min-h-toque min-w-toque items-center justify-center rounded-total border border-vidro bg-vidro"
      >
        <Icone nome="bell" tamanho={22} cor={cores.texto} />
        {notificacoesNaoLidas > 0 ? (
          <View className="absolute right-2 top-2 h-2 w-2 rounded-total bg-atencao" />
        ) : null}
      </View>
    </View>
  );
}
