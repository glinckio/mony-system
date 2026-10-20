import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { useSessao } from '@/stores/sessao';
import { Avatar, Card, Icone, type NomeIcone, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { Linha } from '../components/linha';

type ChaveAtalho =
  | 'orcamentos'
  | 'metas'
  | 'relatorios'
  | 'listas'
  | 'lembretes'
  | 'agenda'
  | 'categorias'
  | 'contas';

/**
 * A grade do design (página 8) tem Parcelamentos, Orçamentos, Metas, Relatórios, Listas, Lembretes,
 * Agenda, Bancos e Categorias. Cada atalho entra quando a tela dele existe; Contas (manuais) fica
 * até Bancos (Open Finance, T-120).
 */
const ATALHOS: { chave: ChaveAtalho; icone: NomeIcone; cor: string; rota: Href }[] = [
  { chave: 'orcamentos', icone: 'chart-pie', cor: cores.atencao, rota: '/orcamentos' },
  { chave: 'metas', icone: 'target', cor: cores.receita, rota: '/metas' },
  { chave: 'relatorios', icone: 'chart-column', cor: cores.link, rota: '/relatorios' },
  { chave: 'listas', icone: 'shopping-cart', cor: cores.receita, rota: '/listas' },
  { chave: 'lembretes', icone: 'bell', cor: cores.atencao, rota: '/lembretes' },
  { chave: 'agenda', icone: 'calendar', cor: cores.link, rota: '/agenda' },
  { chave: 'categorias', icone: 'tag', cor: cores.estourado, rota: '/mais/categorias' },
  { chave: 'contas', icone: 'landmark', cor: cores.receita, rota: '/mais/contas' },
];

const POR_LINHA = 3;

/** Aba Mais (design, página 8): o perfil, a grade de atalhos e as configurações. */
export default function TelaMais() {
  const { t } = useTranslation();
  const router = useRouter();
  const nome = useSessao((estado) => estado.usuario?.nome ?? '');
  const linhas = Array.from({ length: Math.ceil(ATALHOS.length / POR_LINHA) }, (_, indice) =>
    ATALHOS.slice(indice * POR_LINHA, (indice + 1) * POR_LINHA),
  );

  function abrirPerfil() {
    router.push('/mais/perfil');
  }

  return (
    <Tela className="px-4 pt-2">
      <ScrollView contentContainerClassName="gap-3 pb-6">
        <Texto variante="titulo-lg" accessibilityRole="header">
          {t('mais.titulo')}
        </Texto>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('mais.perfil', { nome })}
          onPress={abrirPerfil}
          className="active:opacity-70"
        >
          <Card className="flex-row items-center gap-3">
            <Avatar nome={nome} />
            <Texto variante="titulo" className="flex-1" numberOfLines={1}>
              {nome}
            </Texto>
            <Icone nome="chevron-right" tamanho={18} cor={cores['texto-suave']} />
          </Card>
        </Pressable>
        {linhas.map((linha) => (
          <View key={linha[0]?.chave} className="flex-row gap-3">
            {linha.map(({ chave, icone, cor, rota }) => (
              <Pressable
                key={chave}
                accessibilityRole="button"
                accessibilityLabel={t(`mais.atalhos.${chave}`)}
                onPress={() => {
                  router.push(rota);
                }}
                className="flex-1 items-center gap-2 rounded-lg bg-superficie px-2 py-4 active:opacity-70"
              >
                <Icone nome={icone} tamanho={22} cor={cor} />
                <Texto variante="corpo-sm" className="font-forte" numberOfLines={1}>
                  {t(`mais.atalhos.${chave}`)}
                </Texto>
              </Pressable>
            ))}
            {/* Linha incompleta: espaços vazios mantêm os blocos do mesmo tamanho. */}
            {Array.from({ length: POR_LINHA - linha.length }, (_, indice) => (
              <View key={`vazio-${String(indice)}`} className="flex-1" />
            ))}
          </View>
        ))}
        <Card className="py-1">
          <Linha primeira titulo={t('mais.configuracoes')} aoPressionar={abrirPerfil} />
        </Card>
      </ScrollView>
    </Tela>
  );
}
