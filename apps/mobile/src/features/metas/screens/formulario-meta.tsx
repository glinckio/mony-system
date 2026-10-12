import { type DadosAtualizacaoMeta, esquemaNovaMeta, type Meta } from '@mony/shared/metas';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, type FieldErrors, type Resolver, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { dataParaTexto, mascararData, textoParaData } from '@/features/transacoes/lib/periodo';
import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { Botao, Cabecalho, Campo, CampoValor, Folha, Tela, Texto } from '@/ui';

import { useAtualizarMeta, useCriarMeta, useExcluirMeta } from '../hooks/use-metas';

interface ValoresMeta {
  titulo: string;
  valorAlvoCentavos: number;
  /** `DD/MM/AAAA`; vazio é sem prazo. */
  prazo: string;
}

export interface PropsFormularioMeta {
  /** `null` para meta nova. */
  original: Meta | null;
}

/** `null` é sem prazo; `undefined`, data que não existe. */
function prazoDoTexto(texto: string): string | null | undefined {
  if (texto.trim() === '') return null;
  return textoParaData(texto) ?? undefined;
}

/**
 * Criar e editar meta (RN-063): nome, valor alvo e prazo opcional, validados pelo esquema do
 * `@mony/shared`. A edição manda só o que mudou (`prazo: null` tira o prazo).
 */
export function FormularioMeta({ original }: PropsFormularioMeta) {
  const { t } = useTranslation();
  const router = useRouter();
  const criar = useCriarMeta();
  const atualizar = useAtualizarMeta();
  const excluir = useExcluirMeta();
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const [excluindo, definirExcluindo] = useState(false);

  const resolver: Resolver<ValoresMeta> = (valores) => {
    const prazo = prazoDoTexto(valores.prazo);
    const resultado = esquemaNovaMeta.safeParse({
      titulo: valores.titulo,
      valorAlvoCentavos: valores.valorAlvoCentavos,
      ...(prazo ? { prazo } : {}),
    });
    const errors: FieldErrors<ValoresMeta> = {};
    if (prazo === undefined) errors.prazo = { type: 'validate', message: 'prazo' };
    for (const problema of resultado.success ? [] : resultado.error.issues) {
      const campo = problema.path[0] === 'titulo' ? 'titulo' : 'valorAlvoCentavos';
      errors[campo] = { type: 'validate', message: campo };
    }
    if (Object.keys(errors).length === 0) return { values: valores, errors: {} };
    return { values: {}, errors };
  };
  const formulario = useForm<ValoresMeta>({
    resolver,
    defaultValues: {
      titulo: original?.titulo ?? '',
      valorAlvoCentavos: original?.valorAlvoCentavos ?? 0,
      prazo: original?.prazo ? dataParaTexto(original.prazo) : '',
    },
  });
  const { control } = formulario;

  function voltar() {
    if (original === null) router.dismissTo('/metas');
    else router.dismissTo({ pathname: '/metas/[id]', params: { id: original.id } });
  }

  const salvar = formulario.handleSubmit(async (valores) => {
    definirErroEnvio(null);
    const titulo = valores.titulo.trim();
    const prazo = prazoDoTexto(valores.prazo) ?? null;
    try {
      if (original === null) {
        await criar.mutateAsync({
          titulo,
          valorAlvoCentavos: valores.valorAlvoCentavos,
          ...(prazo === null ? {} : { prazo }),
        });
      } else {
        const mudancas: DadosAtualizacaoMeta = {
          ...(titulo === original.titulo ? {} : { titulo }),
          ...(valores.valorAlvoCentavos === original.valorAlvoCentavos
            ? {}
            : { valorAlvoCentavos: valores.valorAlvoCentavos }),
          ...(prazo === original.prazo ? {} : { prazo }),
        };
        if (Object.keys(mudancas).length > 0) {
          await atualizar.mutateAsync({ id: original.id, dados: mudancas });
        }
      }
      voltar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('metas.semConexao')));
    }
  });

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Cabecalho
          titulo={original === null ? t('metas.nova') : t('metas.editar')}
          aoVoltar={voltar}
        />
        <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
          <CampoControlado
            controle={control}
            nome="titulo"
            rotulo={t('metas.formulario.titulo')}
            placeholder={t('metas.formulario.tituloExemplo')}
            mensagemErro={t('metas.formulario.validacao.titulo')}
            maxLength={100}
          />
          <Controller
            control={control}
            name="valorAlvoCentavos"
            render={({ field, fieldState }) => (
              <CampoValor
                rotulo={t('metas.formulario.alvo')}
                centavos={field.value}
                aoMudar={field.onChange}
                erro={fieldState.error ? t('metas.formulario.validacao.alvo') : null}
              />
            )}
          />
          <Controller
            control={control}
            name="prazo"
            render={({ field, fieldState }) => (
              <Campo
                rotulo={t('metas.formulario.prazo')}
                ajuda={t('metas.formulario.prazoAjuda')}
                value={field.value}
                onChangeText={(texto) => {
                  field.onChange(mascararData(texto));
                }}
                keyboardType="number-pad"
                maxLength={10}
                erro={fieldState.error ? t('metas.formulario.validacao.prazo') : null}
              />
            )}
          />

          {erroEnvio === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {erroEnvio}
            </Texto>
          )}
          <Botao
            titulo={t('metas.formulario.salvar')}
            larguraTotal
            carregando={formulario.formState.isSubmitting}
            aoPressionar={() => void salvar()}
          />
          {original === null ? null : (
            <Botao
              variante="perigo"
              icone="trash"
              titulo={t('metas.formulario.excluir')}
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
          titulo={t('metas.exclusao.titulo', { titulo: original.titulo })}
          aoFechar={() => {
            definirExcluindo(false);
          }}
          rodape={
            <>
              <Botao
                variante="perigo"
                larguraTotal
                titulo={t('metas.exclusao.confirmar')}
                carregando={excluir.isPending}
                aoPressionar={() => {
                  excluir.mutate(original.id, {
                    onSuccess: () => {
                      definirExcluindo(false);
                      router.dismissTo('/metas');
                    },
                  });
                }}
              />
              <Botao
                variante="fantasma"
                titulo={t('metas.exclusao.cancelar')}
                aoPressionar={() => {
                  definirExcluindo(false);
                }}
              />
            </>
          }
        >
          <Texto cor="suave">{t('metas.exclusao.texto')}</Texto>
          {excluir.isError ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {mensagemDeErro(excluir.error, t('metas.semConexao'))}
            </Texto>
          ) : null}
        </Folha>
      )}
    </Tela>
  );
}
