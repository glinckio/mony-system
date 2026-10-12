import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useSessao } from '@/stores/sessao';
import { BotaoIcone, Icone, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

/** "Lúcia Martins" → "LM"; um nome só → as duas primeiras letras. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1) ?? '') : '';
  const letras = ultima === '' ? primeira.slice(0, 2) : `${primeira[0] ?? ''}${ultima[0] ?? ''}`;
  return letras.toUpperCase();
}

interface PropsTopoInicio {
  notificacoesNaoLidas: number;
  aoEscolherPeriodo: () => void;
}

/**
 * O topo do Início (design, página 3): as iniciais (vão para a aba Mais, onde fica o perfil), a
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
          router.push('/mais');
        }}
        className="min-h-toque min-w-toque items-center justify-center rounded-total border border-vidro-forte bg-superficie active:opacity-70"
      >
        <Texto variante="corpo-sm" className="font-negrito">
          {iniciais(nome)}
        </Texto>
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
