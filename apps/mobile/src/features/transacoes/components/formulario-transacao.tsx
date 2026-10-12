import { FORMAS_PAGAMENTO, type FormaPagamento } from '@mony/shared/enums';
import type { EscopoExclusaoOcorrencia } from '@mony/shared/recorrencias';
import { statusPadrao, type Transacao } from '@mony/shared/transacoes';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Controller,
  type FieldErrors,
  type PathValue,
  type Resolver,
  useForm,
  useWatch,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { useHoje } from '@/lib/fuso';
import { Botao, BotaoIcone, Campo, CampoValor, Card, Chip, Folha, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import {
  useAtualizarTransacao,
  useExcluirTransacao,
  useRegistrarTransacao,
} from '../hooks/use-mutacoes';
import { useCatalogos } from '../hooks/use-transacoes';
import { motivoDaTrava, podeExcluir } from '../lib/edicao';
import {
  type CampoFormulario,
  ehCompraNoCartao,
  validarFormulario,
  type ValoresFormulario,
  valoresIniciais,
} from '../lib/formulario';
import { dataParaTexto, mascararData, somarDias, textoParaData } from '../lib/periodo';
import { GrupoOpcoes } from './grupo-opcoes';

export interface PropsFormularioTransacao {
  /** `null` para lançamento novo. */
  original: Transacao | null;
}

/** Texto de erro de cada campo (o do Zod sai em inglês e técnico). */
const VALIDACAO_DO_CAMPO = {
  valorCentavos: 'valor',
  descricao: 'descricao',
  data: 'data',
  categoriaId: 'categoria',
  formaPagamento: 'forma',
  cartaoId: 'cartao',
} as const satisfies Partial<Record<CampoFormulario, string>>;

/**
 * Criar e editar um lançamento (RN-040 a RN-046). A validação usa os esquemas do `@mony/shared`,
 * os mesmos da API; a tela só esconde ou trava o que a API recusaria (lançamento do banco,
 * parcela, pagamento de fatura, compra em fatura paga).
 */
export function FormularioTransacao({ original }: PropsFormularioTransacao) {
  const { t } = useTranslation();
  const router = useRouter();
  const hoje = useHoje();
  const catalogos = useCatalogos();
  const registrar = useRegistrarTransacao();
  const atualizar = useAtualizarTransacao();
  const excluir = useExcluirTransacao();
  // Uma chave por formulário: tentar de novo depois de uma falha não duplica (doc 04).
  const [chaveIdempotencia] = useState(() => randomUUID());
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const [confirmandoExclusao, definirConfirmandoExclusao] = useState(false);

  const trava = original === null ? null : motivoDaTrava(original);
  const travada = trava !== null;

  const resolver: Resolver<ValoresFormulario> = (valores) => {
    const resultado = validarFormulario(valores, original);
    if (resultado.valido) return { values: valores, errors: {} };
    const errors: FieldErrors<ValoresFormulario> = {};
    for (const campo of resultado.campos) errors[campo] = { type: 'validate', message: campo };
    return { values: {}, errors };
  };
  const formulario = useForm<ValoresFormulario>({
    defaultValues: valoresIniciais(hoje, original),
    resolver,
  });
  const { control, setValue, getValues } = formulario;
  const { errors, isSubmitted, isSubmitting } = formulario.formState;
  const [tipo, formaPagamento, categoriaId, cartaoId, contaId, data, pago] = useWatch({
    control,
    name: ['tipo', 'formaPagamento', 'categoriaId', 'cartaoId', 'contaId', 'data', 'pago'],
  });
  const noCartao = ehCompraNoCartao({ formaPagamento });

  function erroDe(campo: keyof typeof VALIDACAO_DO_CAMPO): string | null {
    return errors[campo] ? t(`transacoes.formulario.validacao.${VALIDACAO_DO_CAMPO[campo]}`) : null;
  }

  function mudar<C extends CampoFormulario>(campo: C, valor: PathValue<ValoresFormulario, C>) {
    // Depois da primeira tentativa de salvar, o erro some assim que a pessoa corrige.
    setValue(campo, valor, { shouldDirty: true, shouldValidate: isSubmitted });
  }

  function mudarTipo(novo: ValoresFormulario['tipo']) {
    mudar('tipo', novo);
    const categoria = catalogos.categorias.find((item) => item.id === getValues('categoriaId'));
    if (categoria && categoria.tipo !== novo) mudar('categoriaId', '');
    // Lançamento no cartão de crédito é sempre despesa (RN-031).
    if (novo === 'receita' && getValues('formaPagamento') === 'cartao_credito') {
      mudar('formaPagamento', null);
      mudar('cartaoId', null);
    }
  }

  function mudarForma(nova: FormaPagamento | null) {
    mudar('formaPagamento', nova);
    if (nova === 'cartao_credito') {
      // A compra sai da fatura, não de uma conta, e fica pendente até a fatura ser paga (RN-042).
      mudar('contaId', null);
      mudar('pago', null);
    } else {
      mudar('cartaoId', null);
    }
  }

  /** Volta para a lista, também quando o lançamento foi aberto direto por um link. */
  function voltar() {
    router.dismissTo('/transacoes');
  }

  const salvar = formulario.handleSubmit(async (valores) => {
    const resultado = validarFormulario(valores, original);
    if (!resultado.valido) return;
    definirErroEnvio(null);
    try {
      const { pedido } = resultado;
      if (pedido.tipo === 'novo') {
        await registrar.mutateAsync({ dados: pedido.dados, chave: chaveIdempotencia });
      } else if (original !== null && Object.keys(pedido.dados).length > 0) {
        await atualizar.mutateAsync({ id: original.id, dados: pedido.dados });
      }
      voltar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('transacoes.semConexao')));
    }
  });

  function confirmarExclusao(escopo?: EscopoExclusaoOcorrencia) {
    if (original === null) return;
    excluir.mutate(
      { id: original.id, ...(escopo === undefined ? {} : { escopo }) },
      {
        onSuccess: () => {
          definirConfirmandoExclusao(false);
          voltar();
        },
      },
    );
  }

  const categorias = catalogos.categorias.filter((item) => item.tipo === tipo);
  const formas = FORMAS_PAGAMENTO.filter(
    (forma) => tipo === 'despesa' || forma !== 'cartao_credito',
  );
  const dataDigitada = textoParaData(data);
  // Sem mexer no "já foi pago", a chave mostra o padrão que a API vai aplicar (RN-042).
  const pagoNaTela = pago ?? statusPadrao(formaPagamento, dataDigitada ?? hoje, hoje) === 'pago';
  const erroExclusao = excluir.isError
    ? mensagemDeErro(excluir.error, t('transacoes.semConexao'))
    : null;

  return (
    // Fundo sólido: o topo claro do degradê é só para títulos grandes, e o formulário tem rótulos
    // pequenos logo no começo (T-017).
    <Tela bordas={['top']} degrade={false}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="min-h-botao flex-row items-center gap-1 px-2 pt-2">
          <BotaoIcone
            icone="chevron-left"
            rotulo={t('transacoes.formulario.voltar')}
            aoPressionar={voltar}
          />
          <Texto variante="titulo-lg" accessibilityRole="header">
            {original === null
              ? t('transacoes.formulario.tituloNovo')
              : t('transacoes.formulario.tituloEditar')}
          </Texto>
        </View>
        <ScrollView
          contentContainerClassName="gap-5 px-4 pb-8 pt-3"
          keyboardShouldPersistTaps="handled"
        >
          {trava === null ? null : (
            <Card>
              <Texto cor="suave">{t(`transacoes.formulario.travas.${trava}`)}</Texto>
            </Card>
          )}

          <GrupoOpcoes
            titulo={t('transacoes.formulario.tipo')}
            selecionado={tipo}
            desabilitado={travada}
            aoEscolher={mudarTipo}
            opcoes={[
              { valor: 'despesa', rotulo: t('transacoes.formulario.despesa') },
              { valor: 'receita', rotulo: t('transacoes.formulario.receita') },
            ]}
          />

          <Controller
            control={control}
            name="valorCentavos"
            render={({ field }) => (
              <CampoValor
                rotulo={t('transacoes.formulario.valor')}
                centavos={field.value}
                aoMudar={field.onChange}
                erro={erroDe('valorCentavos')}
                editavel={!travada}
              />
            )}
          />

          <CampoControlado
            controle={control}
            nome="descricao"
            rotulo={t('transacoes.formulario.descricao')}
            placeholder={t('transacoes.formulario.descricaoExemplo')}
            mensagemErro={t('transacoes.formulario.validacao.descricao')}
            maxLength={200}
          />

          <View className="gap-2">
            <Controller
              control={control}
              name="data"
              render={({ field }) => (
                <Campo
                  rotulo={t('transacoes.formulario.data')}
                  ajuda={t('transacoes.formulario.dataAjuda')}
                  value={field.value}
                  onChangeText={(texto) => {
                    field.onChange(mascararData(texto));
                  }}
                  onBlur={field.onBlur}
                  keyboardType="number-pad"
                  maxLength={10}
                  erro={erroDe('data')}
                  editable={!travada}
                />
              )}
            />
            <View className="flex-row gap-2">
              <Chip
                rotulo={t('transacoes.formulario.hoje')}
                selecionado={dataDigitada === hoje}
                desabilitado={travada}
                aoPressionar={() => {
                  mudar('data', dataParaTexto(hoje));
                }}
              />
              <Chip
                rotulo={t('transacoes.formulario.ontem')}
                selecionado={dataDigitada === somarDias(hoje, -1)}
                desabilitado={travada}
                aoPressionar={() => {
                  mudar('data', dataParaTexto(somarDias(hoje, -1)));
                }}
              />
            </View>
          </View>

          <GrupoOpcoes
            titulo={t('transacoes.formulario.categoria')}
            selecionado={categoriaId}
            aoEscolher={(valor) => {
              mudar('categoriaId', valor);
            }}
            opcoes={categorias.map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
            vazio={t('transacoes.formulario.semCategorias')}
            erro={erroDe('categoriaId')}
          />

          <GrupoOpcoes<FormaPagamento | ''>
            titulo={t('transacoes.formulario.forma')}
            selecionado={formaPagamento ?? (tipo === 'receita' ? '' : null)}
            desabilitado={travada}
            aoEscolher={(valor) => {
              mudarForma(valor === '' ? null : valor);
            }}
            opcoes={[
              ...(tipo === 'receita'
                ? [{ valor: '' as const, rotulo: t('transacoes.formulario.nenhumaForma') }]
                : []),
              ...formas.map((valor) => ({ valor, rotulo: t(`transacoes.formas.${valor}`) })),
            ]}
            erro={erroDe('formaPagamento')}
          />

          {noCartao ? (
            <GrupoOpcoes
              titulo={t('transacoes.formulario.cartao')}
              selecionado={cartaoId}
              desabilitado={travada}
              aoEscolher={(valor) => {
                mudar('cartaoId', valor);
              }}
              opcoes={catalogos.cartoes.map(({ id, nome }) => ({ valor: id, rotulo: nome }))}
              vazio={t('transacoes.formulario.semCartoes')}
              erro={erroDe('cartaoId')}
            />
          ) : catalogos.contas.length > 0 ? (
            <GrupoOpcoes
              titulo={t('transacoes.formulario.conta')}
              selecionado={contaId ?? ''}
              desabilitado={travada}
              aoEscolher={(valor) => {
                mudar('contaId', valor === '' ? null : valor);
              }}
              opcoes={[
                { valor: '', rotulo: t('transacoes.formulario.nenhumaConta') },
                ...catalogos.contas.map(({ id, nome }) => ({ valor: id, rotulo: nome })),
              ]}
            />
          ) : null}

          {noCartao ? (
            <Texto variante="corpo-sm" cor="suave">
              {t('transacoes.formulario.cartaoPendente')}
            </Texto>
          ) : (
            <View className="gap-1">
              <View className="min-h-toque flex-row items-center gap-3">
                <Texto className="flex-1">
                  {tipo === 'receita'
                    ? t('transacoes.formulario.recebido')
                    : t('transacoes.formulario.pago')}
                </Texto>
                <Switch
                  accessibilityLabel={
                    tipo === 'receita'
                      ? t('transacoes.formulario.recebido')
                      : t('transacoes.formulario.pago')
                  }
                  value={pagoNaTela}
                  disabled={travada}
                  onValueChange={(valor) => {
                    mudar('pago', valor);
                  }}
                  trackColor={{ true: cores.primaria, false: cores.borda }}
                />
              </View>
              {pago === null && original === null ? (
                <Texto variante="legenda" cor="suave">
                  {t('transacoes.formulario.pagoAjuda')}
                </Texto>
              ) : null}
            </View>
          )}

          <CampoControlado
            controle={control}
            nome="observacao"
            rotulo={t('transacoes.formulario.observacao')}
            mensagemErro=""
            multiline
            maxLength={1000}
          />

          {erroEnvio === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {erroEnvio}
            </Texto>
          )}

          <Botao
            titulo={t('transacoes.formulario.salvar')}
            larguraTotal
            carregando={isSubmitting}
            aoPressionar={() => void salvar()}
          />
          {original !== null && podeExcluir(original) ? (
            <Botao
              variante="perigo"
              icone="trash"
              titulo={t('transacoes.formulario.excluir')}
              larguraTotal
              aoPressionar={() => {
                excluir.reset();
                definirConfirmandoExclusao(true);
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {original === null ? null : (
        <Folha
          visivel={confirmandoExclusao}
          titulo={
            original.recorrenciaId === null
              ? t('transacoes.formulario.confirmarExclusao')
              : t('transacoes.formulario.excluirRecorrencia')
          }
          aoFechar={() => {
            definirConfirmandoExclusao(false);
          }}
          rodape={
            <>
              {original.recorrenciaId === null ? (
                <Botao
                  variante="perigo"
                  larguraTotal
                  titulo={t('transacoes.selecao.confirmar')}
                  carregando={excluir.isPending}
                  aoPressionar={() => {
                    confirmarExclusao();
                  }}
                />
              ) : (
                <>
                  <Botao
                    variante="secundaria"
                    larguraTotal
                    titulo={t('transacoes.formulario.soEsta')}
                    desabilitado={excluir.isPending}
                    aoPressionar={() => {
                      confirmarExclusao('esta');
                    }}
                  />
                  <Botao
                    variante="secundaria"
                    larguraTotal
                    titulo={t('transacoes.formulario.estaEProximas')}
                    desabilitado={excluir.isPending}
                    aoPressionar={() => {
                      confirmarExclusao('proximas');
                    }}
                  />
                  <Botao
                    variante="perigo"
                    larguraTotal
                    titulo={t('transacoes.formulario.todas')}
                    desabilitado={excluir.isPending}
                    aoPressionar={() => {
                      confirmarExclusao('todas');
                    }}
                  />
                </>
              )}
              <Botao
                variante="fantasma"
                titulo={t('transacoes.selecao.cancelar')}
                aoPressionar={() => {
                  definirConfirmandoExclusao(false);
                }}
              />
            </>
          }
        >
          {erroExclusao === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert">
              {erroExclusao}
            </Texto>
          )}
        </Folha>
      )}
    </Tela>
  );
}
