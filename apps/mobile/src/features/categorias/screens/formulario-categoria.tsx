import { zodResolver } from '@hookform/resolvers/zod';
import { type Categoria, esquemaNovaCategoria } from '@mony/shared/categorias';
import type { TipoCategoria } from '@mony/shared/enums';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { Botao, Cabecalho, Folha, GrupoOpcoes, juntarClasses, Tela, Texto } from '@/ui';

import {
  CHAVES_ICONE_CATEGORIA,
  CORES_CATEGORIA,
  IconeCategoria,
} from '../components/icone-categoria';
import {
  useAtualizarCategoria,
  useCategorias,
  useCriarCategoria,
  useExcluirCategoria,
} from '../hooks/use-categorias';

export interface PropsFormularioCategoria {
  /** `null` para categoria nova. */
  original: Categoria | null;
  /** Tipo da categoria nova (a aba de onde veio). */
  tipoInicial?: TipoCategoria;
}

/**
 * Criar e editar categoria (RN-065): nome, tipo (só ao criar), cor e ícone, validados pelo
 * `esquemaNovaCategoria` do `@mony/shared`. Excluir pede a categoria para onde vão os lançamentos
 * (RN-066).
 */
export function FormularioCategoria({
  original,
  tipoInicial = 'despesa',
}: PropsFormularioCategoria) {
  const { t } = useTranslation();
  const router = useRouter();
  const lista = useCategorias();
  const criar = useCriarCategoria();
  const atualizar = useAtualizarCategoria();
  const excluir = useExcluirCategoria();
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const [excluindo, definirExcluindo] = useState(false);
  const [destino, definirDestino] = useState<string | null>(null);

  const formulario = useForm({
    resolver: zodResolver(esquemaNovaCategoria),
    defaultValues: original
      ? { nome: original.nome, tipo: original.tipo, cor: original.cor, icone: original.icone }
      : {
          nome: '',
          tipo: tipoInicial,
          cor: CORES_CATEGORIA[0],
          icone: tipoInicial === 'receita' ? 'salario' : 'outros',
        },
  });
  const { control } = formulario;
  const [nome, tipo, cor, icone] = useWatch({ control, name: ['nome', 'tipo', 'cor', 'icone'] });

  function voltar() {
    router.dismissTo('/mais/categorias');
  }

  const salvar = formulario.handleSubmit(async (dados) => {
    definirErroEnvio(null);
    try {
      if (original === null) {
        await criar.mutateAsync(dados);
      } else {
        const mudancas = {
          ...(dados.nome === original.nome ? {} : { nome: dados.nome }),
          ...(dados.cor === original.cor ? {} : { cor: dados.cor }),
          ...(dados.icone === original.icone ? {} : { icone: dados.icone }),
        };
        if (Object.keys(mudancas).length > 0) {
          await atualizar.mutateAsync({ id: original.id, dados: mudancas });
        }
      }
      voltar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('categorias.semConexao')));
    }
  });

  const destinos = (lista.data?.itens ?? []).filter(
    (item) => original !== null && item.tipo === original.tipo && item.id !== original.id,
  );
  const erroExclusao = excluir.isError
    ? mensagemDeErro(excluir.error, t('categorias.semConexao'))
    : null;

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Cabecalho
          titulo={original === null ? t('categorias.nova') : t('categorias.editar')}
          aoVoltar={voltar}
        />
        <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
          <View className="flex-row items-center gap-3">
            <IconeCategoria icone={icone} cor={cor} tamanho={56} />
            <Texto variante="titulo" numberOfLines={1} className="flex-1">
              {nome.trim() === '' ? t('categorias.campos.nomeExemplo') : nome}
            </Texto>
          </View>

          {original === null ? (
            <Controller
              control={control}
              name="tipo"
              render={({ field }) => (
                <GrupoOpcoes
                  titulo={t('categorias.campos.tipo')}
                  selecionado={field.value}
                  aoEscolher={field.onChange}
                  opcoes={[
                    { valor: 'despesa', rotulo: t('categorias.campos.despesa') },
                    { valor: 'receita', rotulo: t('categorias.campos.receita') },
                  ]}
                />
              )}
            />
          ) : (
            <Texto variante="corpo-sm" cor="suave">
              {`${tipo === 'despesa' ? t('categorias.campos.despesa') : t('categorias.campos.receita')}. ${t('categorias.campos.tipoFixo')}`}
            </Texto>
          )}

          <CampoControlado
            controle={control}
            nome="nome"
            rotulo={t('categorias.campos.nome')}
            placeholder={t('categorias.campos.nomeExemplo')}
            mensagemErro={t('categorias.validacao.nome')}
            maxLength={40}
          />

          <Controller
            control={control}
            name="cor"
            render={({ field }) => (
              <View className="gap-2">
                <Texto variante="corpo-sm" cor="suave" className="font-medio">
                  {t('categorias.campos.cor')}
                </Texto>
                <View className="flex-row flex-wrap gap-3">
                  {CORES_CATEGORIA.map((opcao, indice) => (
                    <Pressable
                      key={opcao}
                      accessibilityRole="button"
                      accessibilityLabel={t('categorias.corNumero', { numero: indice + 1 })}
                      accessibilityState={{ selected: field.value === opcao }}
                      onPress={() => {
                        field.onChange(opcao);
                      }}
                      hitSlop={4}
                      className={juntarClasses(
                        'items-center justify-center rounded-total border-2',
                        field.value === opcao ? 'border-claro' : 'border-transparente',
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
            )}
          />

          <Controller
            control={control}
            name="icone"
            render={({ field }) => (
              <View className="gap-2">
                <Texto variante="corpo-sm" cor="suave" className="font-medio">
                  {t('categorias.campos.icone')}
                </Texto>
                <View className="flex-row flex-wrap gap-2">
                  {CHAVES_ICONE_CATEGORIA.map((chave) => (
                    <Pressable
                      key={chave}
                      accessibilityRole="button"
                      accessibilityLabel={t(`categorias.icones.${chave}`)}
                      accessibilityState={{ selected: field.value === chave }}
                      onPress={() => {
                        field.onChange(chave);
                      }}
                      className={juntarClasses(
                        'rounded-total border-2 p-0.5',
                        field.value === chave ? 'border-claro' : 'border-transparente',
                      )}
                    >
                      <IconeCategoria icone={chave} cor={cor} tamanho={40} />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          />

          {erroEnvio === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {erroEnvio}
            </Texto>
          )}
          <Botao
            titulo={t('categorias.salvar')}
            larguraTotal
            carregando={formulario.formState.isSubmitting}
            aoPressionar={() => void salvar()}
          />
          {original === null ? null : (
            <Botao
              variante="perigo"
              icone="trash"
              titulo={t('categorias.excluir')}
              larguraTotal
              aoPressionar={() => {
                excluir.reset();
                definirDestino(null);
                definirExcluindo(true);
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {original === null ? null : (
        <Folha
          visivel={excluindo}
          titulo={t('categorias.exclusao.titulo', { nome: original.nome })}
          aoFechar={() => {
            definirExcluindo(false);
          }}
          rodape={
            <>
              <Botao
                variante="perigo"
                larguraTotal
                titulo={t('categorias.exclusao.confirmar')}
                desabilitado={destino === null}
                carregando={excluir.isPending}
                aoPressionar={() => {
                  if (destino === null) return;
                  excluir.mutate(
                    { id: original.id, moverPara: destino },
                    {
                      onSuccess: () => {
                        definirExcluindo(false);
                        voltar();
                      },
                    },
                  );
                }}
              />
              <Botao
                variante="fantasma"
                titulo={t('categorias.exclusao.cancelar')}
                aoPressionar={() => {
                  definirExcluindo(false);
                }}
              />
            </>
          }
        >
          <Texto cor="suave">{t('categorias.exclusao.texto')}</Texto>
          {destinos.length === 0 ? (
            <Texto cor="atencao">{t('categorias.exclusao.semDestino')}</Texto>
          ) : (
            <GrupoOpcoes
              titulo={t('categorias.exclusao.destino')}
              selecionado={destino}
              aoEscolher={definirDestino}
              opcoes={destinos.map(({ id, nome: nomeDestino }) => ({
                valor: id,
                rotulo: nomeDestino,
              }))}
            />
          )}
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
