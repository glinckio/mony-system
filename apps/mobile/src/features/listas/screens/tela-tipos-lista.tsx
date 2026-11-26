import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { BotaoIcone, Cabecalho, Card, Erro, Icone, Skeleton, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { useTiposLista } from '../hooks/use-tipos-lista';

/**
 * Tipos de lista (T-123d), como as categorias: os cinco que vêm com a conta e os da pessoa, com a
 * categoria de despesa que a lista finalizada usa (RN-072). Tocar abre a edição; o "+" cria.
 */
export default function TelaTiposLista() {
  const { t } = useTranslation();
  const router = useRouter();
  const consulta = useTiposLista();

  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('listas.tipos.titulo')}
        aoVoltar={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/listas');
        }}
        acao={
          <BotaoIcone
            icone="plus"
            comFundo
            rotulo={t('listas.tipos.novo')}
            aoPressionar={() => {
              router.push('/listas/tipos/novo');
            }}
          />
        }
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
        {consulta.isPending ? (
          <Card className="gap-4">
            <Skeleton altura={40} />
            <Skeleton altura={40} />
          </Card>
        ) : consulta.isError ? (
          <Erro aoTentarDeNovo={() => void consulta.refetch()} />
        ) : (
          <Card className="px-2 py-1">
            {consulta.data.itens.map((tipo, indice) => (
              <Pressable
                key={tipo.id}
                accessibilityRole="button"
                accessibilityLabel={t('listas.tipos.editarTipo', { nome: tipo.nome })}
                onPress={() => {
                  router.push({ pathname: '/listas/tipos/[id]', params: { id: tipo.id } });
                }}
                className={
                  indice === 0
                    ? 'min-h-toque flex-row items-center gap-3 px-2 py-3 active:opacity-70'
                    : 'min-h-toque flex-row items-center gap-3 border-t border-borda px-2 py-3 active:opacity-70'
                }
              >
                <View className="flex-1 gap-0.5">
                  <Texto className="font-forte">{tipo.nome}</Texto>
                  <Texto variante="corpo-sm" cor="suave">
                    {[
                      tipo.categoria === null
                        ? t('listas.tipos.semCategoria')
                        : t('listas.tipos.naCategoria', { categoria: tipo.categoria.nome }),
                      t('listas.tipos.quantasListas', { count: tipo.quantidadeListas }),
                    ].join(' · ')}
                  </Texto>
                </View>
                <Icone nome="pencil" tamanho={18} cor={cores['texto-suave']} />
              </Pressable>
            ))}
          </Card>
        )}
        <Texto variante="corpo-sm" cor="suave" className="text-center">
          {t('listas.tipos.rodape')}
        </Texto>
      </ScrollView>
    </Tela>
  );
}
