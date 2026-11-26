import type { TipoLista } from '@mony/shared/listas';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCategorias } from '@/features/categorias/hooks/use-categorias';
import { mensagemDeErro } from '@/lib/formularios';
import { Botao, Cabecalho, Campo, Folha, GrupoOpcoes, RolagemFormulario, Tela, Texto } from '@/ui';

import {
  useAtualizarTipoLista,
  useCriarTipoLista,
  useExcluirTipoLista,
  useTiposLista,
} from '../hooks/use-tipos-lista';

const SEM_CATEGORIA = 'sem-categoria';

/**
 * Criar e editar tipo de lista (T-123d): o nome e a categoria de despesa que a lista finalizada usa
 * por padrão (RN-072; pode mudar na hora de finalizar). Excluir com listas pede para qual tipo elas
 * vão; o último tipo fica.
 */
export function FormularioTipoLista({ original }: { original: TipoLista | null }) {
  const { t } = useTranslation();
  const router = useRouter();
  const categorias = useCategorias();
  const tipos = useTiposLista();
  const criar = useCriarTipoLista();
  const atualizar = useAtualizarTipoLista();
  const excluir = useExcluirTipoLista();
  const [nome, definirNome] = useState(original?.nome ?? '');
  const [categoriaId, definirCategoriaId] = useState<string>(
    original?.categoria?.id ?? SEM_CATEGORIA,
  );
  const [tentou, definirTentou] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const [excluindo, definirExcluindo] = useState(false);
  const [destino, definirDestino] = useState<string | null>(null);

  const despesas = (categorias.data?.itens ?? []).filter(({ tipo }) => tipo === 'despesa');
  const destinos = (tipos.data?.itens ?? []).filter(({ id }) => id !== original?.id);
  const comListas = (original?.quantidadeListas ?? 0) > 0;

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/listas/tipos');
  }

  async function salvar() {
    definirTentou(true);
    definirErro(null);
    if (nome.trim() === '') return;
    const categoria = categoriaId === SEM_CATEGORIA ? null : categoriaId;
    try {
      if (original === null) {
        await criar.mutateAsync({ nome: nome.trim(), categoriaId: categoria });
      } else {
        const dados = {
          ...(nome.trim() === original.nome ? {} : { nome: nome.trim() }),
          ...(categoria === (original.categoria?.id ?? null) ? {} : { categoriaId: categoria }),
        };
        if (Object.keys(dados).length > 0) await atualizar.mutateAsync({ id: original.id, dados });
      }
      voltar();
    } catch (falha) {
      definirErro(mensagemDeErro(falha, t('listas.semConexao')));
    }
  }

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <View className="flex-1">
        <Cabecalho
          titulo={original === null ? t('listas.tipos.novo') : t('listas.tipos.editar')}
          aoVoltar={voltar}
        />
        <RolagemFormulario contentContainerClassName="gap-5 pb-8 pt-3">
          <Campo
            rotulo={t('listas.tipos.nome')}
            placeholder={t('listas.tipos.nomeExemplo')}
            value={nome}
            onChangeText={definirNome}
            maxLength={40}
            erro={tentou && nome.trim() === '' ? t('listas.tipos.validacaoNome') : null}
          />
          <GrupoOpcoes<string>
            titulo={t('listas.tipos.categoria')}
            opcoes={[
              { valor: SEM_CATEGORIA, rotulo: t('listas.tipos.nenhuma') },
              ...despesas.map(({ id, nome: rotulo }) => ({ valor: id, rotulo })),
            ]}
            selecionado={categoriaId}
            aoEscolher={definirCategoriaId}
          />
          <Texto variante="corpo-sm" cor="suave">
            {t('listas.tipos.categoriaAjuda')}
          </Texto>
          {erro === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {erro}
            </Texto>
          )}
          <Botao
            titulo={t('listas.formulario.salvar')}
            larguraTotal
            carregando={criar.isPending || atualizar.isPending}
            aoPressionar={() => void salvar()}
          />
          {original === null ? null : (
            <Botao
              titulo={t('listas.tipos.excluir')}
              variante="perigo"
              icone="trash"
              larguraTotal
              aoPressionar={() => {
                excluir.reset();
                definirDestino(null);
                definirExcluindo(true);
              }}
            />
          )}
        </RolagemFormulario>
      </View>
      {original === null ? null : (
        <Folha
          visivel={excluindo}
          titulo={t('listas.tipos.exclusaoTitulo', { nome: original.nome })}
          aoFechar={() => {
            definirExcluindo(false);
          }}
          rodape={
            <>
              <Botao
                variante="perigo"
                larguraTotal
                titulo={t('listas.tipos.exclusaoConfirmar')}
                desabilitado={destinos.length === 0 || (comListas && destino === null)}
                carregando={excluir.isPending}
                aoPressionar={() => {
                  excluir.mutate(
                    { id: original.id, moverPara: comListas ? destino : null },
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
                titulo={t('listas.tipos.cancelar')}
                aoPressionar={() => {
                  definirExcluindo(false);
                }}
              />
            </>
          }
        >
          {destinos.length === 0 ? (
            <Texto cor="atencao">{t('listas.tipos.ultimo')}</Texto>
          ) : comListas ? (
            <GrupoOpcoes<string>
              titulo={t('listas.tipos.exclusaoDestino', { count: original.quantidadeListas })}
              selecionado={destino}
              aoEscolher={definirDestino}
              opcoes={destinos.map(({ id, nome: rotulo }) => ({ valor: id, rotulo }))}
            />
          ) : (
            <Texto cor="suave">{t('listas.tipos.exclusaoTexto')}</Texto>
          )}
          {excluir.isError ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {mensagemDeErro(excluir.error, t('listas.semConexao'))}
            </Texto>
          ) : null}
        </Folha>
      )}
    </Tela>
  );
}
