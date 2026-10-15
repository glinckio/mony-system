import { ErroApi, useListarCartoes, useListarCategorias, useListarContas } from '@mony/api-client';
import { FORMAS_PAGAMENTO, type FormaPagamento } from '@mony/shared/enums';
import type { DadosFinalizacaoLista, DetalheLista } from '@mony/shared/listas';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dataParaTexto, mascararData, textoParaData } from '@/features/transacoes/lib/periodo';
import { mensagemDeErro } from '@/lib/formularios';
import { useHoje } from '@/lib/fuso';
import { Botao, Campo, CampoValor, Folha, GrupoOpcoes, Texto } from '@/ui';

import { useFinalizarLista } from '../hooks/use-listas';

export interface PropsFolhaFinalizar {
  lista: DetalheLista;
  visivel: boolean;
  aoFechar: () => void;
}

type Problema = 'valor' | 'descricao' | 'data' | 'categoria' | 'forma' | 'cartao';

/**
 * "Finalizar e lançar despesa" (RN-072): uma despesa com o total dos itens comprados, na categoria
 * padrão da lista. O valor, a descrição, a data e a categoria mudam na hora; a forma de pagamento
 * é obrigatória, e o crédito pede o cartão (RN-041). A API lança e fecha a lista.
 */
export function FolhaFinalizar({ lista, visivel, aoFechar }: PropsFolhaFinalizar) {
  const { t } = useTranslation();
  return (
    <Folha visivel={visivel} titulo={t('listas.finalizar.titulo')} aoFechar={aoFechar}>
      {/* A chave recomeça o formulário com o total de agora a cada vez que a folha abre. */}
      {visivel ? (
        <FormularioFinalizar
          key={String(lista.totalCompradoCentavos)}
          lista={lista}
          aoFechar={aoFechar}
        />
      ) : null}
    </Folha>
  );
}

function FormularioFinalizar({ lista, aoFechar }: { lista: DetalheLista; aoFechar: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const hoje = useHoje();
  const categorias = useListarCategorias();
  const cartoes = useListarCartoes();
  const contas = useListarContas();
  const finalizar = useFinalizarLista();
  // Uma chave por folha: tentar de novo depois de uma falha de rede não lança duas despesas.
  const [chave] = useState(() => randomUUID());
  const [valorCentavos, definirValor] = useState(lista.totalCompradoCentavos);
  const [descricao, definirDescricao] = useState(lista.nome);
  const [data, definirData] = useState(dataParaTexto(hoje));
  const [categoriaId, definirCategoria] = useState<string | null>(
    lista.categoriaDespesa?.id ?? null,
  );
  const [forma, definirForma] = useState<FormaPagamento | null>(null);
  const [cartaoId, definirCartao] = useState<string | null>(null);
  const [contaId, definirConta] = useState('');
  const [tentou, definirTentou] = useState(false);
  const [erro, definirErro] = useState<unknown>(null);

  const dataEscolhida = textoParaData(data);
  const noCartao = forma === 'cartao_credito';
  const despesas = (categorias.data?.itens ?? []).filter(({ tipo }) => tipo === 'despesa');
  const listaDeContas = contas.data?.itens ?? [];

  const problemas: Problema[] = [];
  if (valorCentavos <= 0) problemas.push('valor');
  if (descricao.trim() === '') problemas.push('descricao');
  if (dataEscolhida === null) problemas.push('data');
  if (categoriaId === null) problemas.push('categoria');
  if (forma === null) problemas.push('forma');
  if (noCartao && cartaoId === null) problemas.push('cartao');
  const erroDe = (problema: Problema) =>
    tentou && problemas.includes(problema) ? t(`listas.finalizar.validacao.${problema}`) : null;
  const limite = erro instanceof ErroApi && erro.codigo === 'LIMITE_PLANO_ATINGIDO';

  async function lancar() {
    definirTentou(true);
    definirErro(null);
    if (problemas.length > 0 || forma === null || categoriaId === null || dataEscolhida === null) {
      return;
    }
    const dados: DadosFinalizacaoLista = {
      formaPagamento: forma,
      valorCentavos,
      descricao: descricao.trim(),
      data: dataEscolhida,
      categoriaId,
      ...(noCartao && cartaoId !== null ? { cartaoId } : {}),
      ...(!noCartao && contaId !== '' ? { contaId } : {}),
    };
    try {
      await finalizar.mutateAsync({ id: lista.id, dados, chave });
      aoFechar();
    } catch (falha) {
      definirErro(falha);
    }
  }

  return (
    <>
      <Texto cor="suave">{t('listas.finalizar.ajuda')}</Texto>
      <CampoValor
        rotulo={t('listas.finalizar.valor')}
        centavos={valorCentavos}
        aoMudar={definirValor}
        erro={erroDe('valor')}
        testID="valor-finalizar"
      />
      <Campo
        rotulo={t('listas.finalizar.descricao')}
        value={descricao}
        onChangeText={definirDescricao}
        maxLength={200}
        erro={erroDe('descricao')}
      />
      <Campo
        rotulo={t('listas.finalizar.data')}
        ajuda={t('listas.finalizar.dataAjuda')}
        value={data}
        onChangeText={(texto) => {
          definirData(mascararData(texto));
        }}
        keyboardType="number-pad"
        maxLength={10}
        erro={erroDe('data')}
      />
      <GrupoOpcoes
        titulo={t('listas.finalizar.categoria')}
        selecionado={categoriaId}
        aoEscolher={definirCategoria}
        opcoes={despesas.map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
        vazio={t('listas.finalizar.semCategorias')}
        erro={erroDe('categoria')}
      />
      <GrupoOpcoes<FormaPagamento>
        titulo={t('listas.finalizar.forma')}
        selecionado={forma}
        aoEscolher={(valor) => {
          definirForma(valor);
          if (valor !== 'cartao_credito') definirCartao(null);
        }}
        opcoes={FORMAS_PAGAMENTO.map((valor) => ({
          valor,
          rotulo: t(`transacoes.formas.${valor}`),
        }))}
        erro={erroDe('forma')}
      />
      {noCartao ? (
        <GrupoOpcoes
          titulo={t('listas.finalizar.cartao')}
          selecionado={cartaoId}
          aoEscolher={definirCartao}
          opcoes={(cartoes.data?.itens ?? []).map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
          vazio={t('listas.finalizar.semCartoes')}
          erro={erroDe('cartao')}
        />
      ) : listaDeContas.length > 0 ? (
        <GrupoOpcoes
          titulo={t('listas.finalizar.conta')}
          selecionado={contaId}
          aoEscolher={definirConta}
          opcoes={[
            { valor: '', rotulo: t('listas.finalizar.nenhumaConta') },
            ...listaDeContas.map(({ id, nome }) => ({ valor: id, rotulo: nome })),
          ]}
        />
      ) : null}
      {erro === null ? null : (
        <Texto
          cor={limite ? 'texto' : 'perigo'}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {mensagemDeErro(erro, t('listas.semConexao'))}
        </Texto>
      )}
      {limite ? (
        <Botao
          titulo={t('listas.verPlanos')}
          variante="secundaria"
          larguraTotal
          aoPressionar={() => {
            aoFechar();
            router.push('/planos');
          }}
        />
      ) : null}
      <Botao
        titulo={t('listas.finalizar.lancar')}
        larguraTotal
        carregando={finalizar.isPending}
        aoPressionar={() => void lancar()}
      />
    </>
  );
}
