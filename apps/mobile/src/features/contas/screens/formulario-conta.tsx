import {
  type Conta,
  type DadosAtualizacaoConta,
  esquemaAtualizacaoConta,
  esquemaNovaConta,
} from '@mony/shared/contas';
import { TIPOS_CONTA, type TipoConta } from '@mony/shared/enums';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, type FieldErrors, type Resolver, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { Botao, Cabecalho, CampoValor, Card, Folha, GrupoOpcoes, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { useAtualizarConta, useCriarConta, useExcluirConta } from '../hooks/use-contas';

interface ValoresConta {
  nome: string;
  tipo: TipoConta;
  /** Sem sinal; o sinal vem de `negativo`. */
  saldoCentavos: number;
  negativo: boolean;
}

export interface PropsFormularioConta {
  /** `null` para conta nova. */
  original: Conta | null;
}

function dadosDaConta(valores: ValoresConta) {
  return {
    nome: valores.nome.trim(),
    tipo: valores.tipo,
    saldoInicialCentavos: valores.negativo ? -valores.saldoCentavos : valores.saldoCentavos,
  };
}

/**
 * Criar e editar conta: nome, tipo e saldo inicial (pode ser negativo), validados pelos esquemas do
 * `@mony/shared`. Conta do banco (Open Finance) só muda o nome e não sai por aqui (doc 05).
 */
export function FormularioConta({ original }: PropsFormularioConta) {
  const { t } = useTranslation();
  const router = useRouter();
  const criar = useCriarConta();
  const atualizar = useAtualizarConta();
  const excluir = useExcluirConta();
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const [excluindo, definirExcluindo] = useState(false);
  const doBanco = original?.origem === 'open_finance';

  const resolver: Resolver<ValoresConta> = (valores) => {
    const resultado = doBanco
      ? esquemaAtualizacaoConta.safeParse({ nome: valores.nome.trim() })
      : esquemaNovaConta.safeParse(dadosDaConta(valores));
    if (resultado.success) return { values: valores, errors: {} };
    const errors: FieldErrors<ValoresConta> = {};
    for (const problema of resultado.error.issues) {
      const campo = problema.path[0] === 'nome' ? 'nome' : 'saldoCentavos';
      errors[campo] = { type: 'validate', message: campo };
    }
    return { values: {}, errors };
  };
  const formulario = useForm<ValoresConta>({
    resolver,
    defaultValues: {
      nome: original?.nome ?? '',
      tipo: original?.tipo ?? 'corrente',
      saldoCentavos: Math.abs(original?.saldoInicialCentavos ?? 0),
      negativo: (original?.saldoInicialCentavos ?? 0) < 0,
    },
  });
  const { control } = formulario;
  const negativo = useWatch({ control, name: 'negativo' });

  function voltar() {
    router.dismissTo('/mais/contas');
  }

  const salvar = formulario.handleSubmit(async (valores) => {
    definirErroEnvio(null);
    const dados = dadosDaConta(valores);
    try {
      if (original === null) {
        await criar.mutateAsync(dados);
      } else {
        const mudancas: DadosAtualizacaoConta = {
          ...(dados.nome === original.nome ? {} : { nome: dados.nome }),
          ...(doBanco || dados.tipo === original.tipo ? {} : { tipo: dados.tipo }),
          ...(doBanco || dados.saldoInicialCentavos === original.saldoInicialCentavos
            ? {}
            : { saldoInicialCentavos: dados.saldoInicialCentavos }),
        };
        if (Object.keys(mudancas).length > 0) {
          await atualizar.mutateAsync({ id: original.id, dados: mudancas });
        }
      }
      voltar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('contas.semConexao')));
    }
  });

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Cabecalho
          titulo={original === null ? t('contas.nova') : t('contas.editar')}
          aoVoltar={voltar}
        />
        <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
          {doBanco ? (
            <Card>
              <Texto cor="suave">{t('contas.bancoSoNome')}</Texto>
            </Card>
          ) : null}
          <CampoControlado
            controle={control}
            nome="nome"
            rotulo={t('contas.campos.nome')}
            placeholder={t('contas.campos.nomeExemplo')}
            mensagemErro={t('contas.validacao.nome')}
            maxLength={60}
          />
          <Controller
            control={control}
            name="tipo"
            render={({ field }) => (
              <GrupoOpcoes
                titulo={t('contas.campos.tipo')}
                selecionado={field.value}
                aoEscolher={field.onChange}
                desabilitado={doBanco}
                opcoes={TIPOS_CONTA.map((valor) => ({ valor, rotulo: t(`contas.tipos.${valor}`) }))}
              />
            )}
          />
          <View className="gap-2">
            <Controller
              control={control}
              name="saldoCentavos"
              render={({ field }) => (
                <CampoValor
                  rotulo={t('contas.campos.saldoInicial')}
                  centavos={field.value}
                  aoMudar={field.onChange}
                  editavel={!doBanco}
                />
              )}
            />
            <Texto variante="legenda" cor="suave">
              {t('contas.campos.saldoInicialAjuda')}
            </Texto>
            <View className="min-h-toque flex-row items-center gap-3">
              <Texto className="flex-1">{t('contas.campos.negativo')}</Texto>
              <Controller
                control={control}
                name="negativo"
                render={({ field }) => (
                  <Switch
                    accessibilityLabel={t('contas.campos.negativo')}
                    value={negativo}
                    disabled={doBanco}
                    onValueChange={field.onChange}
                    trackColor={{ true: cores.perigo, false: cores.borda }}
                  />
                )}
              />
            </View>
          </View>

          {erroEnvio === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {erroEnvio}
            </Texto>
          )}
          <Botao
            titulo={t('contas.salvar')}
            larguraTotal
            carregando={formulario.formState.isSubmitting}
            aoPressionar={() => void salvar()}
          />
          {original === null || doBanco ? null : (
            <Botao
              variante="perigo"
              icone="trash"
              titulo={t('contas.excluir')}
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
          titulo={t('contas.exclusao.titulo', { nome: original.nome })}
          aoFechar={() => {
            definirExcluindo(false);
          }}
          rodape={
            <>
              <Botao
                variante="perigo"
                larguraTotal
                titulo={t('contas.exclusao.confirmar')}
                carregando={excluir.isPending}
                aoPressionar={() => {
                  excluir.mutate(original.id, {
                    onSuccess: () => {
                      definirExcluindo(false);
                      voltar();
                    },
                  });
                }}
              />
              <Botao
                variante="fantasma"
                titulo={t('contas.exclusao.cancelar')}
                aoPressionar={() => {
                  definirExcluindo(false);
                }}
              />
            </>
          }
        >
          <Texto cor="suave">{t('contas.exclusao.texto')}</Texto>
          {excluir.isError ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {mensagemDeErro(excluir.error, t('contas.semConexao'))}
            </Texto>
          ) : null}
        </Folha>
      )}
    </Tela>
  );
}
