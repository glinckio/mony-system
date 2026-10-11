import type { Transacao } from '@mony/shared/transacoes';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { IconeCategoria } from '@/features/categorias/components/icone-categoria';
import { Etiqueta, Icone, juntarClasses, Texto, Valor } from '@/ui';
import { cores } from '@/ui/tokens';

export interface PropsItemTransacao {
  transacao: Transacao;
  categoria: { icone: string; cor: string } | undefined;
  /** "Alimentação", "Nubank", "via Mony"… */
  detalhes: string[];
  /** Texto do valor para o leitor de tela (com sinal, ou "Valor oculto"). */
  valorFalado: string;
  selecionando: boolean;
  selecionado: boolean;
  aoTocar: () => void;
  aoSegurar: () => void;
}

/**
 * Linha da lista: ícone da categoria, descrição, detalhes e valor. Receita vem com "+" em verde,
 * despesa com "-"; pendente ganha a etiqueta. Na seleção múltipla, o ícone vira a marcação.
 */
export function ItemTransacao({
  transacao,
  categoria,
  detalhes,
  valorFalado,
  selecionando,
  selecionado,
  aoTocar,
  aoSegurar,
}: PropsItemTransacao) {
  const { t } = useTranslation();
  const receita = transacao.tipo === 'receita';
  const pendente = transacao.status === 'pendente';
  const textoDetalhes = detalhes.join(' · ');
  const rotulo = t(pendente ? 'transacoes.item.rotuloPendente' : 'transacoes.item.rotulo', {
    descricao: transacao.descricao,
    valor: valorFalado,
    detalhes: detalhes.join(', '),
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={selecionando ? { selected: selecionado } : undefined}
      onPress={aoTocar}
      onLongPress={aoSegurar}
      testID={`transacao-${transacao.id}`}
      className={juntarClasses(
        'min-h-toque flex-row items-center gap-3 rounded-md px-2 py-2 active:opacity-70',
        selecionado && 'bg-primaria-suave',
      )}
    >
      {selecionando ? (
        <View className="items-center justify-center" style={{ width: 40, height: 40 }}>
          <Icone
            nome={selecionado ? 'circle-check' : 'circle'}
            tamanho={26}
            cor={selecionado ? cores.primaria : cores['texto-suave']}
          />
        </View>
      ) : (
        <IconeCategoria icone={categoria?.icone} cor={categoria?.cor} />
      )}
      <View className="flex-1 gap-0.5">
        <Texto className="font-forte" numberOfLines={1}>
          {transacao.descricao}
        </Texto>
        <Texto variante="corpo-sm" cor="suave" numberOfLines={2}>
          {textoDetalhes}
        </Texto>
      </View>
      <View className="items-end gap-1">
        <Valor
          centavos={receita ? transacao.valorCentavos : -transacao.valorCentavos}
          tipo={receita ? 'receita' : 'neutro'}
          comSinal={receita}
        />
        {pendente ? <Etiqueta texto={t('transacoes.item.pendente')} tom="atencao" /> : null}
      </View>
    </Pressable>
  );
}
