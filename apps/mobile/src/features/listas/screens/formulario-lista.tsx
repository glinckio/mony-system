import { ErroApi } from '@mony/api-client';
import type { DadosAtualizacaoLista, DetalheLista } from '@mony/shared/listas';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { Botao, Cabecalho, Campo, Folha, GrupoOpcoes, RolagemFormulario, Tela, Texto } from '@/ui';

import { useAtualizarLista, useCriarLista, useExcluirLista } from '../hooks/use-listas';
import { useTiposLista } from '../hooks/use-tipos-lista';

export interface PropsFormularioLista {
  /** `null` para a nova. */
  original: DetalheLista | null;
}

/**
 * Nova e editar lista (RN-070): o nome e o tipo (os da pessoa, T-123d), que decide a categoria da
 * despesa ao finalizar (RN-072). A nova abre a lista criada; no gratuito, a segunda lista aberta recebe o
 * `LIMITE_PLANO_ATINGIDO` com [Ver planos] (RN-120). Na edição, "Excluir lista".
 */
export function FormularioLista({ original }: PropsFormularioLista) {
  const { t } = useTranslation();
  const router = useRouter();
  const criar = useCriarLista();
  const atualizar = useAtualizarLista();
  const excluir = useExcluirLista();
  const [nome, definirNome] = useState(original?.nome ?? '');
  const tipos = useTiposLista();
  const [escolhido, definirTipo] = useState<string | null>(original?.tipoId ?? null);
  // Sem escolha, o primeiro tipo da pessoa (Mercado, nos padrões).
  const tipoId = escolhido ?? tipos.data?.itens[0]?.id ?? null;
  const [tentou, definirTentou] = useState(false);
  const [erro, definirErro] = useState<unknown>(null);
  const [confirmando, definirConfirmando] = useState(false);
  const limite = erro instanceof ErroApi && erro.codigo === 'LIMITE_PLANO_ATINGIDO';

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/listas');
  }

  async function salvar() {
    definirTentou(true);
    definirErro(null);
    if (nome.trim() === '' || tipoId === null) return;
    try {
      if (original === null) {
        const lista = await criar.mutateAsync({ nome: nome.trim(), tipoId });
        router.replace({ pathname: '/listas/[id]', params: { id: lista.id } });
        return;
      }
      const dados: DadosAtualizacaoLista = {
        ...(nome.trim() === original.nome ? {} : { nome: nome.trim() }),
        ...(tipoId === original.tipoId ? {} : { tipoId }),
      };
      if (Object.keys(dados).length > 0) await atualizar.mutateAsync({ id: original.id, dados });
      voltar();
    } catch (falha) {
      definirErro(falha);
    }
  }

  async function confirmarExclusao() {
    if (original === null) return;
    try {
      await excluir.mutateAsync(original.id);
      definirConfirmando(false);
      router.dismissTo('/listas');
    } catch (falha) {
      definirConfirmando(false);
      definirErro(falha);
    }
  }

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <View className="flex-1">
        <Cabecalho
          titulo={original === null ? t('listas.nova') : t('listas.editar')}
          aoVoltar={voltar}
        />
        <RolagemFormulario contentContainerClassName="gap-5 pb-8 pt-3">
          <Campo
            rotulo={t('listas.formulario.nome')}
            placeholder={t('listas.formulario.nomeExemplo')}
            value={nome}
            onChangeText={definirNome}
            maxLength={80}
            erro={tentou && nome.trim() === '' ? t('listas.formulario.validacao.nome') : null}
          />
          <GrupoOpcoes<string>
            titulo={t('listas.formulario.categoria')}
            opcoes={(tipos.data?.itens ?? []).map(({ id, nome: rotulo }) => ({
              valor: id,
              rotulo,
            }))}
            selecionado={tipoId}
            aoEscolher={definirTipo}
            vazio={tipos.isError ? t('listas.semConexao') : undefined}
          />
          <Botao
            titulo={t('listas.tipos.gerenciar')}
            variante="fantasma"
            icone="pencil"
            aoPressionar={() => {
              router.push('/listas/tipos');
            }}
          />
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
                router.push('/planos');
              }}
            />
          ) : null}
          <Botao
            titulo={t('listas.formulario.salvar')}
            larguraTotal
            carregando={criar.isPending || atualizar.isPending}
            aoPressionar={() => void salvar()}
          />
          {original === null ? null : (
            <Botao
              titulo={t('listas.formulario.excluir')}
              variante="perigo"
              icone="trash"
              larguraTotal
              aoPressionar={() => {
                definirConfirmando(true);
              }}
            />
          )}
        </RolagemFormulario>
      </View>
      <Folha
        visivel={confirmando}
        titulo={t('listas.excluir.titulo')}
        aoFechar={() => {
          definirConfirmando(false);
        }}
        rodape={
          <>
            <Botao
              titulo={t('listas.excluir.confirmar')}
              variante="perigo"
              larguraTotal
              carregando={excluir.isPending}
              aoPressionar={() => void confirmarExclusao()}
            />
            <Botao
              titulo={t('listas.excluir.cancelar')}
              variante="secundaria"
              larguraTotal
              aoPressionar={() => {
                definirConfirmando(false);
              }}
            />
          </>
        }
      >
        <Texto cor="suave">
          {original?.finalizadaEm === null
            ? t('listas.excluir.aberta')
            : t('listas.excluir.finalizada')}
        </Texto>
      </Folha>
    </Tela>
  );
}
