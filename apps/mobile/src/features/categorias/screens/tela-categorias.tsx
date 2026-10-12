import type { TipoCategoria } from '@mony/shared/enums';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { BotaoIcone, Cabecalho, Card, Erro, Icone, Segmentado, Skeleton, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { IconeCategoria } from '../components/icone-categoria';
import { useCategorias } from '../hooks/use-categorias';

/**
 * Categorias (design, página 8): despesas e receitas em abas, com o ícone e a cor de cada uma.
 * Tocar abre a edição; o "+" cria no tipo da aba (RN-065).
 */
export default function TelaCategorias() {
  const { t } = useTranslation();
  const router = useRouter();
  const consulta = useCategorias();
  const [tipo, definirTipo] = useState<TipoCategoria>('despesa');

  const todas = consulta.data?.itens ?? [];
  const doTipo = todas.filter((categoria) => categoria.tipo === tipo);
  const quantas = (qual: TipoCategoria) => todas.filter((item) => item.tipo === qual).length;

  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('categorias.titulo')}
        aoVoltar={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/mais');
        }}
        acao={
          <BotaoIcone
            icone="plus"
            comFundo
            rotulo={t('categorias.nova')}
            aoPressionar={() => {
              router.push({ pathname: '/mais/categorias/nova', params: { tipo } });
            }}
          />
        }
      />
      <Segmentado
        rotulo={t('categorias.tipo')}
        selecionado={tipo}
        aoEscolher={definirTipo}
        opcoes={[
          {
            valor: 'despesa',
            rotulo: t('categorias.despesas', { quantidade: quantas('despesa') }),
          },
          {
            valor: 'receita',
            rotulo: t('categorias.receitas', { quantidade: quantas('receita') }),
          },
        ]}
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
        {consulta.isPending ? (
          <Card className="gap-4">
            <Skeleton altura={40} />
            <Skeleton altura={40} />
            <Skeleton altura={40} />
          </Card>
        ) : consulta.isError ? (
          <Erro aoTentarDeNovo={() => void consulta.refetch()} />
        ) : (
          <Card className="px-2 py-1">
            {doTipo.length === 0 ? (
              <Texto cor="suave" className="p-3">
                {t('categorias.vazio')}
              </Texto>
            ) : null}
            {doTipo.map((categoria, indice) => (
              <Pressable
                key={categoria.id}
                accessibilityRole="button"
                accessibilityLabel={t('categorias.editarCategoria', { nome: categoria.nome })}
                onPress={() => {
                  router.push({ pathname: '/mais/categorias/[id]', params: { id: categoria.id } });
                }}
                className={
                  indice === 0
                    ? 'min-h-toque flex-row items-center gap-3 px-2 py-3 active:opacity-70'
                    : 'min-h-toque flex-row items-center gap-3 border-t border-borda px-2 py-3 active:opacity-70'
                }
              >
                <IconeCategoria icone={categoria.icone} cor={categoria.cor} tamanho={44} />
                <View className="flex-1 gap-0.5">
                  <Texto className="font-forte">{categoria.nome}</Texto>
                  {categoria.padrao ? (
                    <Texto variante="corpo-sm" cor="suave">
                      {t('categorias.padrao')}
                    </Texto>
                  ) : null}
                </View>
                <Icone nome="pencil" tamanho={18} cor={cores['texto-suave']} />
              </Pressable>
            ))}
          </Card>
        )}
        <Texto variante="corpo-sm" cor="suave" className="text-center">
          {t('categorias.rodape')}
        </Texto>
      </ScrollView>
    </Tela>
  );
}
