import { ErroApi } from '@mony/api-client';
import {
  FORMAS_PAGAMENTO,
  type FormaPagamento,
  FREQUENCIAS_RECORRENCIA,
  type FrequenciaRecorrencia,
} from '@mony/shared/enums';
import {
  type DadosAtualizacaoRecorrencia,
  diaPadrao,
  esquemaAtualizacaoRecorrencia,
  type Recorrencia,
} from '@mony/shared/recorrencias';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import {
  Botao,
  Cabecalho,
  Campo,
  CampoValor,
  Card,
  Erro,
  Folha,
  GrupoOpcoes,
  Skeleton,
  Tela,
  Texto,
} from '@/ui';

import {
  useAtualizarRecorrencia,
  useExcluirRecorrencia,
  useRecorrencia,
} from '../hooks/use-recorrencias';
import { useCatalogos } from '../hooks/use-transacoes';
import { dataParaTexto, mascararData, textoParaData } from '../lib/periodo';

type CampoComErro = 'valor' | 'descricao' | 'dia' | 'dataFim';

function FormularioRecorrencia({ original }: { original: Recorrencia }) {
  const { t } = useTranslation();
  const router = useRouter();
  const catalogos = useCatalogos();
  const atualizar = useAtualizarRecorrencia();
  const parar = useExcluirRecorrencia();
  const semana = t('comum.semana', { returnObjects: true });
  const [valor, definirValor] = useState(original.valorCentavos);
  const [descricao, definirDescricao] = useState(original.descricao);
  const [categoriaId, definirCategoriaId] = useState(original.categoriaId);
  const [forma, definirForma] = useState<FormaPagamento | null>(original.formaPagamento);
  const [cartaoId, definirCartaoId] = useState(original.cartaoId);
  const [contaId, definirContaId] = useState(original.contaId);
  const [frequencia, definirFrequencia] = useState(original.frequencia);
  const [dia, definirDia] = useState(String(original.dia));
  const [dataFim, definirDataFim] = useState(
    original.dataFim === null ? '' : dataParaTexto(original.dataFim),
  );
  const [erros, definirErros] = useState<Set<CampoComErro>>(new Set());
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const [parando, definirParando] = useState(false);
  const noCartao = forma === 'cartao_credito';

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/transacoes');
  }

  function mudarFrequencia(nova: FrequenciaRecorrencia) {
    definirFrequencia(nova);
    // Dia da semana (0 a 6) e do mês (1 a 31) não se convertem: volta ao da data de início.
    if ((nova === 'semanal') !== (original.frequencia === 'semanal')) {
      definirDia(String(diaPadrao(nova, original.dataInicio)));
    } else {
      definirDia(String(original.dia));
    }
  }

  /** Só o que mudou (`PATCH /recorrencias/:id`); `dataFim: null` tira a data final. */
  function mudancas(): DadosAtualizacaoRecorrencia {
    const fim = dataFim.trim() === '' ? null : textoParaData(dataFim);
    const numeroDia = Number(dia);
    return {
      ...(descricao.trim() === original.descricao ? {} : { descricao: descricao.trim() }),
      ...(valor === original.valorCentavos ? {} : { valorCentavos: valor }),
      ...(categoriaId === original.categoriaId ? {} : { categoriaId }),
      ...(forma === null || forma === original.formaPagamento ? {} : { formaPagamento: forma }),
      ...(noCartao && cartaoId !== null && cartaoId !== original.cartaoId ? { cartaoId } : {}),
      ...(!noCartao && contaId !== original.contaId ? { contaId } : {}),
      ...(frequencia === original.frequencia ? {} : { frequencia }),
      ...(numeroDia === original.dia && frequencia === original.frequencia
        ? {}
        : { dia: numeroDia }),
      ...(fim === original.dataFim ? {} : { dataFim: fim }),
    };
  }

  function validar(dados: DadosAtualizacaoRecorrencia): Set<CampoComErro> {
    const problemas = new Set<CampoComErro>();
    if (dataFim.trim() !== '') {
      const fim = textoParaData(dataFim);
      if (fim === null || fim < original.dataInicio) problemas.add('dataFim');
    }
    if (!/^\d{1,2}$/.test(dia)) problemas.add('dia');
    const resultado = esquemaAtualizacaoRecorrencia.safeParse(dados);
    for (const problema of resultado.success ? [] : resultado.error.issues) {
      const campo = String(problema.path[0]);
      if (campo === 'valorCentavos') problemas.add('valor');
      if (campo === 'descricao') problemas.add('descricao');
      if (campo === 'dia') problemas.add('dia');
      if (campo === 'dataFim') problemas.add('dataFim');
    }
    return problemas;
  }

  function salvar() {
    definirErroEnvio(null);
    const dados = mudancas();
    const problemas = validar(dados);
    definirErros(problemas);
    if (problemas.size > 0) return;
    if (Object.keys(dados).length === 0) {
      voltar();
      return;
    }
    atualizar.mutate(
      { id: original.id, dados },
      {
        onSuccess: voltar,
        onError: (falha) => {
          definirErroEnvio(mensagemDeErro(falha, t('transacoes.semConexao')));
        },
      },
    );
  }

  const categorias = catalogos.categorias.filter((item) => item.tipo === original.tipo);
  const formas = FORMAS_PAGAMENTO.filter(
    (valorForma) => original.tipo === 'despesa' || valorForma !== 'cartao_credito',
  );

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
        <Card>
          <Texto cor="suave">
            {t('transacoes.recorrencia.comecou', { data: dataParaTexto(original.dataInicio) })}
            {'. '}
            {t('transacoes.recorrencia.aviso')}
          </Texto>
        </Card>
        <CampoValor
          rotulo={t('transacoes.formulario.valor')}
          centavos={valor}
          aoMudar={definirValor}
          erro={erros.has('valor') ? t('transacoes.formulario.validacao.valor') : null}
        />
        <Campo
          rotulo={t('transacoes.formulario.descricao')}
          value={descricao}
          onChangeText={definirDescricao}
          maxLength={200}
          erro={erros.has('descricao') ? t('transacoes.formulario.validacao.descricao') : null}
        />
        <GrupoOpcoes
          titulo={t('transacoes.formulario.categoria')}
          selecionado={categoriaId}
          aoEscolher={definirCategoriaId}
          opcoes={categorias.map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
        />
        <GrupoOpcoes
          titulo={t('transacoes.formulario.forma')}
          selecionado={forma}
          aoEscolher={(nova) => {
            definirForma(nova);
            if (nova === 'cartao_credito') {
              definirContaId(null);
              definirCartaoId(original.cartaoId ?? catalogos.cartoes[0]?.id ?? null);
            }
          }}
          opcoes={formas.map((valorForma) => ({
            valor: valorForma,
            rotulo: t(`transacoes.formas.${valorForma}`),
          }))}
        />
        {noCartao ? (
          <GrupoOpcoes
            titulo={t('transacoes.formulario.cartao')}
            selecionado={cartaoId}
            aoEscolher={definirCartaoId}
            opcoes={catalogos.cartoes.map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
            vazio={t('transacoes.formulario.semCartoes')}
          />
        ) : catalogos.contas.length > 0 ? (
          <GrupoOpcoes
            titulo={t('transacoes.formulario.conta')}
            selecionado={contaId ?? ''}
            aoEscolher={(valorConta) => {
              definirContaId(valorConta === '' ? null : valorConta);
            }}
            opcoes={[
              { valor: '', rotulo: t('transacoes.formulario.nenhumaConta') },
              ...catalogos.contas.map(({ id, nome }) => ({ valor: id, rotulo: nome })),
            ]}
          />
        ) : null}
        <GrupoOpcoes
          titulo={t('transacoes.recorrencia.frequencia')}
          selecionado={frequencia}
          aoEscolher={mudarFrequencia}
          opcoes={FREQUENCIAS_RECORRENCIA.map((valorFrequencia) => ({
            valor: valorFrequencia,
            rotulo: t(`transacoes.formulario.repetir.${valorFrequencia}`),
          }))}
        />
        {frequencia === 'semanal' ? (
          <GrupoOpcoes
            titulo={t('transacoes.recorrencia.diaDaSemana')}
            selecionado={dia}
            aoEscolher={definirDia}
            opcoes={semana.map((nome, indice) => ({ valor: String(indice), rotulo: nome }))}
            erro={erros.has('dia') ? t('transacoes.recorrencia.validacao.dia') : null}
          />
        ) : (
          <Campo
            rotulo={t('transacoes.recorrencia.diaDoMes')}
            ajuda={t('transacoes.recorrencia.diaDoMesAjuda')}
            value={dia}
            onChangeText={(texto) => {
              definirDia(texto.replace(/\D/g, ''));
            }}
            keyboardType="number-pad"
            maxLength={2}
            erro={erros.has('dia') ? t('transacoes.recorrencia.validacao.dia') : null}
          />
        )}
        <Campo
          rotulo={t('transacoes.recorrencia.dataFim')}
          ajuda={t('transacoes.recorrencia.dataFimAjuda')}
          value={dataFim}
          onChangeText={(texto) => {
            definirDataFim(mascararData(texto));
          }}
          keyboardType="number-pad"
          maxLength={10}
          erro={erros.has('dataFim') ? t('transacoes.recorrencia.validacao.dataFim') : null}
        />
        {erroEnvio === null ? null : (
          <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {erroEnvio}
          </Texto>
        )}
        <Botao
          titulo={t('transacoes.recorrencia.salvar')}
          larguraTotal
          carregando={atualizar.isPending}
          aoPressionar={salvar}
        />
        <Botao
          variante="perigo"
          titulo={t('transacoes.recorrencia.parar')}
          larguraTotal
          aoPressionar={() => {
            parar.reset();
            definirParando(true);
          }}
        />
      </ScrollView>

      <Folha
        visivel={parando}
        titulo={t('transacoes.recorrencia.pararTitulo')}
        aoFechar={() => {
          definirParando(false);
        }}
        rodape={
          <>
            <Botao
              variante="perigo"
              larguraTotal
              titulo={t('transacoes.recorrencia.pararSim')}
              carregando={parar.isPending}
              aoPressionar={() => {
                parar.mutate(original.id, {
                  onSuccess: () => {
                    definirParando(false);
                    router.dismissTo('/transacoes');
                  },
                });
              }}
            />
            <Botao
              variante="fantasma"
              titulo={t('transacoes.recorrencia.cancelar')}
              aoPressionar={() => {
                definirParando(false);
              }}
            />
          </>
        }
      >
        <Texto cor="suave">{t('transacoes.recorrencia.pararTexto')}</Texto>
        {parar.isError ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(parar.error, t('transacoes.semConexao'))}
          </Texto>
        ) : null}
      </Folha>
    </KeyboardAvoidingView>
  );
}

/**
 * Editar a recorrência (`/recorrencias/<id>`, RN-043): o modelo (valor, descrição, categoria,
 * forma), a frequência, o dia e a data final. A API refaz as ocorrências futuras livres. Daqui
 * também dá para parar.
 */
export default function TelaRecorrencia() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useRecorrencia(id);
  const recorrencia = consulta.data;
  const naoEncontrada = consulta.error instanceof ErroApi && consulta.error.status === 404;

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/transacoes');
  }

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <Cabecalho titulo={t('transacoes.recorrencia.titulo')} aoVoltar={voltar} />
      {recorrencia?.ativa ? (
        <FormularioRecorrencia key={recorrencia.id} original={recorrencia} />
      ) : recorrencia ? (
        <Card className="mt-3">
          <Texto cor="suave">{t('transacoes.recorrencia.parada')}</Texto>
        </Card>
      ) : consulta.isPending ? (
        <View className="gap-4 pt-3">
          <Skeleton altura={50} />
          <Skeleton altura={50} />
        </View>
      ) : (
        <Erro
          mensagem={naoEncontrada ? t('transacoes.recorrencia.naoEncontrada') : undefined}
          aoTentarDeNovo={naoEncontrada ? undefined : () => void consulta.refetch()}
        />
      )}
    </Tela>
  );
}
