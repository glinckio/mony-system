import { dataNoFuso } from '@mony/shared/datas';
import type { DetalheLista } from '@mony/shared/listas';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDataCurta } from '@/lib/datas-texto';
import { Card, Etiqueta, Texto, useTextoDoValor, Valor } from '@/ui';

import { comparacaoComOrcamento } from '../lib/listas';

export interface PropsResumoDaLista {
  lista: DetalheLista;
  fuso: string;
}

/**
 * O topo da lista (design, página 6): o nome, quantos itens já foram comprados e o total estimado
 * contra o orçamento livre da categoria (RN-073), em laranja quando a lista passa dele.
 */
export function ResumoDaLista({ lista, fuso }: PropsResumoDaLista) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const dataCurta = useDataCurta();
  const comparacao = comparacaoComOrcamento(lista);
  const categoria = lista.categoriaDespesa?.nome ?? null;

  function textoDoOrcamento(): string | null {
    if (categoria === null) return null;
    if (comparacao === null) return t('listas.semOrcamento', { categoria });
    return comparacao.restanteCentavos < 0
      ? t('listas.orcamentoEstourado', {
          categoria,
          valor: textoDoValor(-comparacao.restanteCentavos),
        })
      : t('listas.orcamentoLivre', {
          categoria,
          valor: textoDoValor(comparacao.restanteCentavos),
        });
  }
  const orcamento = lista.finalizadaEm === null ? textoDoOrcamento() : null;

  return (
    <Card className="gap-3" testID="resumo-lista">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-0.5">
          <Texto variante="titulo" accessibilityRole="header">
            {lista.nome}
          </Texto>
          <Texto variante="corpo-sm" cor="suave">
            {t('listas.progresso', {
              count: lista.quantidadeItens,
              comprados: lista.quantidadeComprados,
            })}
          </Texto>
        </View>
        {lista.finalizadaEm === null ? null : (
          <Etiqueta
            tom="receita"
            texto={t('listas.finalizadaEm', {
              data: dataCurta(dataNoFuso(new Date(lista.finalizadaEm), fuso)),
            })}
          />
        )}
      </View>
      <View className="flex-row items-end gap-3 rounded-md bg-superficie-alta px-3 py-2">
        <View className="gap-0.5">
          <Texto variante="legenda" cor="suave" className="font-forte">
            {t('listas.totalEstimado')}
          </Texto>
          <Valor centavos={lista.totalEstimadoCentavos} variante="titulo" testID="total-estimado" />
        </View>
        {orcamento === null ? null : (
          <Texto
            variante="legenda"
            cor={comparacao === null ? 'suave' : comparacao.passa ? 'atencao' : 'receita'}
            className="flex-1 text-right font-forte"
            testID="orcamento-livre"
          >
            {orcamento}
          </Texto>
        )}
      </View>
      {comparacao?.passa === true && lista.finalizadaEm === null ? (
        <Texto variante="corpo-sm" cor="atencao" accessibilityRole="alert">
          {t('listas.passaDoOrcamento')}
        </Texto>
      ) : null}
    </Card>
  );
}
