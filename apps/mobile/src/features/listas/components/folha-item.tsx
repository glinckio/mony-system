import { formatarCentavos } from '@mony/shared/dinheiro';
import type { DadosAtualizacaoItemLista, ItemLista } from '@mony/shared/listas';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { useDataCurta } from '@/lib/datas-texto';
import { Botao, Campo, CampoValor, Folha, Texto } from '@/ui';

import { useAtualizarItem, useExcluirItem } from '../hooks/use-listas';
import { lerQuantidade, quantidadeParaTexto } from '../lib/listas';

/** A unidade ao lado da quantidade, em pt. */
const LARGURA_UNIDADE = 112;

export interface PropsFolhaItem {
  listaId: string;
  /** `null` fecha a folha. */
  item: ItemLista | null;
  aoFechar: () => void;
}

/** O que mudou no item; vazio se nada. */
function mudancas(
  item: ItemLista,
  valores: { nome: string; quantidade: number; unidade: string; precoCentavos: number },
): DadosAtualizacaoItemLista {
  const unidade = valores.unidade.trim() === '' ? null : valores.unidade.trim();
  const preco = valores.precoCentavos === 0 ? null : valores.precoCentavos;
  return {
    ...(valores.nome.trim() === item.nome ? {} : { nome: valores.nome.trim() }),
    ...(valores.quantidade === item.quantidade ? {} : { quantidade: valores.quantidade }),
    ...(unidade === item.unidade ? {} : { unidade }),
    ...(preco === item.precoEstimadoCentavos ? {} : { precoEstimadoCentavos: preco }),
  };
}

/**
 * Editar um item da lista (RN-070): o nome, a quantidade, a unidade e o preço por unidade (vazio
 * deixa sem preço), com o último preço pago nas notas (RN-071). "Tirar da lista" apaga o item.
 */
export function FolhaItem({ listaId, item, aoFechar }: PropsFolhaItem) {
  const { t } = useTranslation();
  return (
    <Folha visivel={item !== null} titulo={t('listas.item.titulo')} aoFechar={aoFechar}>
      {item === null ? null : (
        // A chave recomeça o formulário quando outro item abre.
        <FormularioItem key={item.id} listaId={listaId} item={item} aoFechar={aoFechar} />
      )}
    </Folha>
  );
}

function FormularioItem({
  listaId,
  item,
  aoFechar,
}: {
  listaId: string;
  item: ItemLista;
  aoFechar: () => void;
}) {
  const { t } = useTranslation();
  const dataCurta = useDataCurta();
  const atualizar = useAtualizarItem(listaId);
  const excluir = useExcluirItem();
  const [nome, definirNome] = useState(item.nome);
  const [quantidade, definirQuantidade] = useState(quantidadeParaTexto(item.quantidade));
  const [unidade, definirUnidade] = useState(item.unidade ?? '');
  const [precoCentavos, definirPreco] = useState(item.precoEstimadoCentavos ?? 0);
  const [tentou, definirTentou] = useState(false);
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const quantidadeLida = lerQuantidade(quantidade);
  const historico = item.historico;

  async function salvar() {
    definirTentou(true);
    definirErroEnvio(null);
    if (nome.trim() === '' || quantidadeLida === null) return;
    const dados = mudancas(item, { nome, quantidade: quantidadeLida, unidade, precoCentavos });
    try {
      if (Object.keys(dados).length > 0) await atualizar.mutateAsync({ id: item.id, dados });
      aoFechar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('listas.semConexao')));
    }
  }

  async function tirar() {
    definirErroEnvio(null);
    try {
      await excluir.mutateAsync(item.id);
      aoFechar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('listas.semConexao')));
    }
  }

  return (
    <>
      <Campo
        rotulo={t('listas.item.nome')}
        value={nome}
        onChangeText={definirNome}
        maxLength={120}
        erro={tentou && nome.trim() === '' ? t('listas.item.validacao.nome') : null}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Campo
            rotulo={t('listas.item.quantidade')}
            ajuda={t('listas.item.quantidadeAjuda')}
            value={quantidade}
            onChangeText={definirQuantidade}
            keyboardType="decimal-pad"
            maxLength={9}
            erro={tentou && quantidadeLida === null ? t('listas.item.validacao.quantidade') : null}
          />
        </View>
        <View style={{ width: LARGURA_UNIDADE }}>
          <Campo
            rotulo={t('listas.item.unidade')}
            ajuda={t('listas.item.unidadeAjuda')}
            value={unidade}
            onChangeText={definirUnidade}
            maxLength={20}
            autoCapitalize="none"
          />
        </View>
      </View>
      <CampoValor
        rotulo={t('listas.item.preco')}
        centavos={precoCentavos}
        aoMudar={definirPreco}
        testID="preco-item"
      />
      {historico === null ? null : (
        <Texto variante="corpo-sm" cor="suave">
          {t('listas.ultimoPreco', {
            valor: formatarCentavos(historico.ultimoCentavos),
            loja: historico.loja,
            data: dataCurta(historico.data),
          })}
        </Texto>
      )}
      {erroEnvio === null ? null : (
        <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erroEnvio}
        </Texto>
      )}
      <Botao
        titulo={t('listas.item.salvar')}
        larguraTotal
        carregando={atualizar.isPending}
        aoPressionar={() => void salvar()}
      />
      <Botao
        titulo={t('listas.item.tirar')}
        variante="perigo"
        larguraTotal
        carregando={excluir.isPending}
        aoPressionar={() => void tirar()}
      />
    </>
  );
}
