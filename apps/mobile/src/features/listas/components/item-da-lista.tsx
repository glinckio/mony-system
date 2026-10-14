import type { ItemLista } from '@mony/shared/listas';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icone, juntarClasses, Texto, Valor } from '@/ui';
import { cores } from '@/ui/tokens';

import { partesDaQuantidade, variacaoDoItem } from '../lib/listas';

/** A caixa do design: quadrada, azul e com o check quando comprado. */
const TAMANHO_CAIXA = 22;

export interface PropsItemDaLista {
  item: ItemLista;
  /** `null` na lista finalizada: o item não muda mais. */
  aoMarcar: ((comprado: boolean) => void) | null;
  aoEditar: (() => void) | null;
  /** A linha entre um item e o de cima. */
  separado?: boolean;
}

/**
 * Um item da lista (design, página 6): a caixa de comprado, o nome riscado quando comprado, a
 * quantidade ("(x6)"), o preço total do item e a variação desde a última compra (RN-071).
 */
export function ItemDaLista({ item, aoMarcar, aoEditar, separado = false }: PropsItemDaLista) {
  const { t } = useTranslation();
  const quantidade = partesDaQuantidade(item);
  const variacao = item.comprado ? null : variacaoDoItem(item);
  const textoQuantidade =
    quantidade === null
      ? ''
      : ` ${
          quantidade.tipo === 'vezes'
            ? t('listas.quantidadeVezes', { quantidade: quantidade.quantidade })
            : t('listas.quantidadeUnidade', quantidade)
        }`;

  return (
    <View
      className={juntarClasses(
        'min-h-toque flex-row items-center gap-3 py-2',
        separado && 'border-t border-borda',
      )}
      testID={`item-${item.id}`}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={t('listas.marcar', { nome: item.nome })}
        accessibilityState={{ checked: item.comprado, disabled: aoMarcar === null }}
        disabled={aoMarcar === null}
        hitSlop={10}
        onPress={() => {
          aoMarcar?.(!item.comprado);
        }}
        className={juntarClasses(
          'items-center justify-center rounded-sm border',
          item.comprado ? 'border-primaria bg-primaria' : 'border-texto-suave bg-claro',
        )}
        style={{ width: TAMANHO_CAIXA, height: TAMANHO_CAIXA }}
      >
        {item.comprado ? <Icone nome="check" tamanho={16} espessura={3} cor={cores.texto} /> : null}
      </Pressable>
      <Pressable
        accessibilityRole={aoEditar === null ? undefined : 'button'}
        accessibilityLabel={
          aoEditar === null ? undefined : t('listas.editarItem', { nome: item.nome })
        }
        disabled={aoEditar === null}
        onPress={aoEditar ?? undefined}
        className="flex-1 flex-row items-center gap-3 active:opacity-70"
      >
        <View className="flex-1 gap-0.5">
          <Texto
            variante="corpo"
            cor={item.comprado ? 'fraco' : 'texto'}
            className={juntarClasses('font-forte', item.comprado && 'line-through')}
          >
            {`${item.nome}${textoQuantidade}`}
          </Texto>
          {variacao === null ? null : (
            <Texto variante="legenda" cor={variacao.sentido === 'subiu' ? 'atencao' : 'receita'}>
              {t(`listas.${variacao.sentido}`, { percentual: variacao.percentual })}
            </Texto>
          )}
        </View>
        {item.totalEstimadoCentavos === null ? (
          <Texto variante="corpo-sm" cor="fraco">
            {t('listas.semPreco')}
          </Texto>
        ) : (
          <Valor centavos={item.totalEstimadoCentavos} variante="corpo-sm" />
        )}
      </Pressable>
    </View>
  );
}
