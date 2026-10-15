import {
  type Cartao,
  type DadosAtualizacaoCartao,
  esquemaAtualizacaoCartao,
  esquemaNovoCartao,
  FAIXAS_ALERTA_PADRAO,
} from '@mony/shared/cartoes';
import { BANDEIRAS_CARTAO, type BandeiraCartao } from '@mony/shared/enums';
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
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { BotaoVerPlanos } from '@/features/planos/components/botao-ver-planos';
import { useContas } from '@/features/contas/hooks/use-contas';
import { CampoControlado, ehLimiteDoPlano, mensagemDeErro } from '@/lib/formularios';
import {
  Botao,
  Cabecalho,
  Campo,
  CampoValor,
  Card,
  Chip,
  Folha,
  GrupoOpcoes,
  juntarClasses,
  Tela,
  Texto,
} from '@/ui';

import { CartaoVisual } from '../components/cartao-visual';
import { useAtualizarCartao, useCriarCartao, useExcluirCartao } from '../hooks/use-cartoes';

/** Cores oferecidas para o cartão (dado do usuário, como a cor da categoria). */
export const CORES_CARTAO = [
  '#7C3AED',
  '#5B21B6',
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#0EA5E9',
  '#14B8A6',
  '#22C55E',
  '#64748B',
  '#1F2937',
] as const;

/** Faixas de aviso de limite oferecidas (RN-038: até 5, de 1% a 100%). */
const FAIXAS_OFERECIDAS = [50, 70, 80, 90, 100] as const;

interface ValoresCartao {
  nome: string;
  bandeira: BandeiraCartao | null;
  final: string;
  limiteCentavos: number;
  diaFechamento: string;
  diaVencimento: string;
  cor: string;
  faixas: number[];
  contaPagamentoId: string | null;
}

type CampoCartao = keyof ValoresCartao;

const CAMPO_DO_ERRO: Partial<Record<string, CampoCartao>> = {
  nome: 'nome',
  final: 'final',
  limiteTotalCentavos: 'limiteCentavos',
  diaFechamento: 'diaFechamento',
  diaVencimento: 'diaVencimento',
  faixasAlerta: 'faixas',
};

function dadosDoCartao(valores: ValoresCartao) {
  return {
    nome: valores.nome.trim(),
    ...(valores.bandeira === null ? {} : { bandeira: valores.bandeira }),
    ...(valores.final === '' ? {} : { final: valores.final }),
    limiteTotalCentavos: valores.limiteCentavos,
    diaFechamento: Number(valores.diaFechamento),
    diaVencimento: Number(valores.diaVencimento),
    cor: valores.cor,
    faixasAlerta: [...valores.faixas].sort((a, b) => a - b),
    ...(valores.contaPagamentoId === null ? {} : { contaPagamentoId: valores.contaPagamentoId }),
  };
}

const mesmasFaixas = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length &&
  [...a].sort((x, y) => x - y).every((faixa, i) => faixa === [...b].sort((x, y) => x - y)[i]);

/**
 * Só o que mudou; `null` limpa bandeira, final e conta. Cartão do banco só muda nome, cor, avisos
 * e conta de pagamento (RN-039).
 */
function mudancas(valores: ValoresCartao, original: Cartao): DadosAtualizacaoCartao {
  const dados = dadosDoCartao(valores);
  const basicos: DadosAtualizacaoCartao = {
    ...(dados.nome === original.nome ? {} : { nome: dados.nome }),
    ...(dados.cor === original.cor ? {} : { cor: dados.cor }),
    ...(mesmasFaixas(dados.faixasAlerta, original.faixasAlerta)
      ? {}
      : { faixasAlerta: dados.faixasAlerta }),
    ...(valores.contaPagamentoId === original.contaPagamentoId
      ? {}
      : { contaPagamentoId: valores.contaPagamentoId }),
  };
  if (original.origem === 'open_finance') return basicos;
  return {
    ...basicos,
    ...(valores.bandeira === original.bandeira ? {} : { bandeira: valores.bandeira }),
    ...((valores.final === '' ? null : valores.final) === original.final
      ? {}
      : { final: valores.final === '' ? null : valores.final }),
    ...(dados.limiteTotalCentavos === original.limiteTotalCentavos
      ? {}
      : { limiteTotalCentavos: dados.limiteTotalCentavos }),
    ...(dados.diaFechamento === original.diaFechamento
      ? {}
      : { diaFechamento: dados.diaFechamento }),
    ...(dados.diaVencimento === original.diaVencimento
      ? {}
      : { diaVencimento: dados.diaVencimento }),
  };
}

export interface PropsFormularioCartao {
  /** `null` para cartão novo. */
  original: Cartao | null;
}

/**
 * Cadastro e edição do cartão (RN-030, RN-038): nome, bandeira, final, limite, dias de fechamento
 * e vencimento, cor, avisos de limite e conta que paga a fatura, validados pelos esquemas do
 * `@mony/shared`.
 */
export function FormularioCartao({ original }: PropsFormularioCartao) {
  const { t } = useTranslation();
  const router = useRouter();
  const contas = useContas();
  const criar = useCriarCartao();
  const atualizar = useAtualizarCartao();
  const excluir = useExcluirCartao();
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const [limite, definirLimite] = useState(false);
  const [excluindo, definirExcluindo] = useState(false);
  const doBanco = original?.origem === 'open_finance';

  const resolver: Resolver<ValoresCartao> = (valores) => {
    const resultado =
      original !== null && doBanco
        ? esquemaAtualizacaoCartao.safeParse(mudancas(valores, original))
        : esquemaNovoCartao.safeParse(dadosDoCartao(valores));
    if (resultado.success) return { values: valores, errors: {} };
    const errors: FieldErrors<ValoresCartao> = {};
    for (const problema of resultado.error.issues) {
      const campo = CAMPO_DO_ERRO[String(problema.path[0])];
      if (campo) errors[campo] = { type: 'validate', message: campo };
    }
    return { values: {}, errors };
  };
  const formulario = useForm<ValoresCartao>({
    resolver,
    defaultValues: original
      ? {
          nome: original.nome,
          bandeira: (BANDEIRAS_CARTAO as readonly string[]).includes(original.bandeira ?? '')
            ? (original.bandeira as BandeiraCartao)
            : null,
          final: original.final ?? '',
          limiteCentavos: original.limiteTotalCentavos,
          diaFechamento: String(original.diaFechamento),
          diaVencimento: String(original.diaVencimento),
          cor: original.cor,
          faixas: [...original.faixasAlerta],
          contaPagamentoId: original.contaPagamentoId,
        }
      : {
          nome: '',
          bandeira: null,
          final: '',
          limiteCentavos: 0,
          diaFechamento: '',
          diaVencimento: '',
          cor: CORES_CARTAO[0],
          faixas: [...FAIXAS_ALERTA_PADRAO],
          contaPagamentoId: null,
        },
  });
  const { control, setValue } = formulario;
  const { errors, isSubmitted } = formulario.formState;
  const [nome, final, cor, faixas, diaFechamento, bandeira] = useWatch({
    control,
    name: ['nome', 'final', 'cor', 'faixas', 'diaFechamento', 'bandeira'],
  });

  function mudar<C extends CampoCartao>(campo: C, valor: PathValue<ValoresCartao, C>) {
    setValue(campo, valor, { shouldDirty: true, shouldValidate: isSubmitted });
  }

  function voltar() {
    if (original === null) router.dismissTo('/cartoes');
    else router.dismissTo({ pathname: '/cartoes/[id]', params: { id: original.id } });
  }

  const salvar = formulario.handleSubmit(async (valores) => {
    definirErroEnvio(null);
    definirLimite(false);
    try {
      if (original === null) {
        await criar.mutateAsync(dadosDoCartao(valores));
      } else {
        const dados = mudancas(valores, original);
        if (Object.keys(dados).length > 0) await atualizar.mutateAsync({ id: original.id, dados });
      }
      voltar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('cartoes.semConexao')));
      definirLimite(ehLimiteDoPlano(falha));
    }
  });

  const erroDia = (campo: 'diaFechamento' | 'diaVencimento') =>
    errors[campo] ? t('cartoes.formulario.validacao.dia') : null;

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Cabecalho
          titulo={original === null ? t('cartoes.novo') : t('cartoes.editar')}
          aoVoltar={voltar}
        />
        <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
          <View className="items-center">
            <CartaoVisual
              largura={280}
              cartao={{
                nome: nome.trim() === '' ? t('cartoes.formulario.nomeExemplo') : nome,
                final: final.length === 4 ? final : null,
                cor,
                diaFechamento: Number(diaFechamento) || 1,
                bandeira: bandeira === null ? null : t(`cartoes.bandeiras.${bandeira}`),
                origem: original?.origem ?? 'manual',
              }}
            />
          </View>
          {doBanco ? (
            <Card>
              <Texto cor="suave">{t('cartoes.formulario.doBanco')}</Texto>
            </Card>
          ) : null}

          <CampoControlado
            controle={control}
            nome="nome"
            rotulo={t('cartoes.formulario.nome')}
            placeholder={t('cartoes.formulario.nomeExemplo')}
            mensagemErro={t('cartoes.formulario.validacao.nome')}
            maxLength={60}
          />
          <GrupoOpcoes
            titulo={t('cartoes.formulario.bandeira')}
            selecionado={bandeira}
            desabilitado={doBanco}
            aoEscolher={(valor) => {
              mudar('bandeira', valor === bandeira ? null : valor);
            }}
            opcoes={BANDEIRAS_CARTAO.map((valor) => ({
              valor,
              rotulo: t(`cartoes.bandeiras.${valor}`),
            }))}
          />
          <Controller
            control={control}
            name="final"
            render={({ field }) => (
              <Campo
                rotulo={t('cartoes.formulario.final')}
                value={field.value}
                onChangeText={(texto) => {
                  field.onChange(texto.replace(/\D/g, '').slice(0, 4));
                }}
                keyboardType="number-pad"
                maxLength={4}
                editable={!doBanco}
                erro={errors.final ? t('cartoes.formulario.validacao.final') : null}
              />
            )}
          />
          <Controller
            control={control}
            name="limiteCentavos"
            render={({ field }) => (
              <CampoValor
                rotulo={t('cartoes.formulario.limite')}
                centavos={field.value}
                aoMudar={field.onChange}
                editavel={!doBanco}
                erro={errors.limiteCentavos ? t('cartoes.formulario.validacao.limite') : null}
              />
            )}
          />
          <View className="gap-1">
            <View className="flex-row gap-3">
              {(['diaFechamento', 'diaVencimento'] as const).map((campo) => (
                <View key={campo} className="flex-1">
                  <Controller
                    control={control}
                    name={campo}
                    render={({ field }) => (
                      <Campo
                        rotulo={
                          campo === 'diaFechamento'
                            ? t('cartoes.formulario.fechamento')
                            : t('cartoes.formulario.vencimento')
                        }
                        value={field.value}
                        onChangeText={(texto) => {
                          field.onChange(texto.replace(/\D/g, '').slice(0, 2));
                        }}
                        keyboardType="number-pad"
                        maxLength={2}
                        editable={!doBanco}
                        erro={erroDia(campo)}
                      />
                    )}
                  />
                </View>
              ))}
            </View>
            <Texto variante="legenda" cor="suave">
              {t('cartoes.formulario.diaAjuda')}
            </Texto>
          </View>

          <View className="gap-2">
            <Texto variante="corpo-sm" cor="suave" className="font-medio">
              {t('cartoes.formulario.cor')}
            </Texto>
            <View className="flex-row flex-wrap gap-3">
              {CORES_CARTAO.map((opcao, indice) => (
                <Pressable
                  key={opcao}
                  accessibilityRole="button"
                  accessibilityLabel={t('cartoes.formulario.corNumero', { numero: indice + 1 })}
                  accessibilityState={{ selected: cor === opcao }}
                  onPress={() => {
                    mudar('cor', opcao);
                  }}
                  hitSlop={4}
                  className={juntarClasses(
                    'items-center justify-center rounded-total border-2',
                    cor === opcao ? 'border-claro' : 'border-transparente',
                  )}
                  style={{ width: 40, height: 40 }}
                >
                  <View
                    className="rounded-total"
                    style={{ width: 28, height: 28, backgroundColor: opcao }}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          <View className="gap-2" accessibilityLabel={t('cartoes.formulario.faixas')}>
            <Texto variante="corpo-sm" cor="suave" className="font-medio">
              {t('cartoes.formulario.faixas')}
            </Texto>
            <View className="flex-row flex-wrap gap-2">
              {FAIXAS_OFERECIDAS.map((faixa) => (
                <Chip
                  key={faixa}
                  rotulo={`${String(faixa)}%`}
                  selecionado={faixas.includes(faixa)}
                  aoPressionar={() => {
                    mudar(
                      'faixas',
                      faixas.includes(faixa)
                        ? faixas.filter((item) => item !== faixa)
                        : [...faixas, faixa],
                    );
                  }}
                />
              ))}
            </View>
            <Texto variante="legenda" cor="suave">
              {t('cartoes.formulario.faixasAjuda')}
            </Texto>
          </View>

          {(contas.data?.itens.length ?? 0) > 0 ? (
            <Controller
              control={control}
              name="contaPagamentoId"
              render={({ field }) => (
                <GrupoOpcoes
                  titulo={t('cartoes.formulario.conta')}
                  selecionado={field.value ?? ''}
                  aoEscolher={(valor) => {
                    field.onChange(valor === '' ? null : valor);
                  }}
                  opcoes={[
                    { valor: '', rotulo: t('cartoes.formulario.nenhumaConta') },
                    ...(contas.data?.itens ?? []).map(({ id, nome: nomeConta }) => ({
                      valor: id,
                      rotulo: nomeConta,
                    })),
                  ]}
                />
              )}
            />
          ) : null}

          {erroEnvio === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {erroEnvio}
            </Texto>
          )}
          {limite ? <BotaoVerPlanos /> : null}
          <Botao
            titulo={t('cartoes.formulario.salvar')}
            larguraTotal
            carregando={formulario.formState.isSubmitting}
            aoPressionar={() => void salvar()}
          />
          {original === null ? null : (
            <Botao
              variante="perigo"
              icone="trash"
              titulo={t('cartoes.formulario.excluir')}
              larguraTotal
              aoPressionar={() => {
                excluir.reset();
                definirExcluindo(true);
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {original === null ? null : (
        <Folha
          visivel={excluindo}
          titulo={t('cartoes.formulario.confirmarExclusao', { nome: original.nome })}
          aoFechar={() => {
            definirExcluindo(false);
          }}
          rodape={
            <>
              <Botao
                variante="perigo"
                larguraTotal
                titulo={t('cartoes.formulario.confirmar')}
                carregando={excluir.isPending}
                aoPressionar={() => {
                  excluir.mutate(original.id, {
                    onSuccess: () => {
                      definirExcluindo(false);
                      router.dismissTo('/cartoes');
                    },
                  });
                }}
              />
              <Botao
                variante="fantasma"
                titulo={t('cartoes.formulario.cancelar')}
                aoPressionar={() => {
                  definirExcluindo(false);
                }}
              />
            </>
          }
        >
          <Texto cor="suave">{t('cartoes.formulario.explicacaoExclusao')}</Texto>
          {excluir.isError ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {mensagemDeErro(excluir.error, t('cartoes.semConexao'))}
            </Texto>
          ) : null}
        </Folha>
      )}
    </Tela>
  );
}
