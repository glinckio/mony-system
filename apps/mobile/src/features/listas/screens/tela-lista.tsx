import { ErroApi } from '@mony/api-client';
import type { ItemLista } from '@mony/shared/listas';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { BotaoSair } from '@/features/compartilhamentos/components/botao-sair';
import { FolhaCompartilhar } from '@/features/compartilhamentos/components/folha-compartilhar';
import { PessoasDoRecurso } from '@/features/compartilhamentos/components/pessoas-do-recurso';
import { useCompartilhamentos } from '@/features/compartilhamentos/hooks/use-compartilhamentos';
import {
  enviadosDoRecurso,
  nomesDasPessoas,
} from '@/features/compartilhamentos/lib/compartilhamentos';
import { mensagemDeErro } from '@/lib/formularios';
import { useFusoDoUsuario } from '@/lib/fuso';
import { Botao, BotaoIcone, Cabecalho, Campo, Card, Erro, Skeleton, Tela, Texto } from '@/ui';

import { FolhaFinalizar } from '../components/folha-finalizar';
import { FolhaItem } from '../components/folha-item';
import { ItemDaLista } from '../components/item-da-lista';
import { ResumoDaLista } from '../components/resumo-da-lista';
import { useAdicionarItem, useAtualizarItem, useLista, useListaAoVivo } from '../hooks/use-listas';

/**
 * A lista de compras (`/listas/<id>`, design, página 6): o total estimado contra o orçamento livre
 * (RN-073), os itens com a caixa de comprado e a variação do preço (RN-071), o campo para pôr um
 * item (a API sugere o preço pelas notas) e o "Finalizar e lançar despesa" (RN-072). Tocar no item
 * abre a edição. A finalizada só mostra os itens e leva à despesa lançada.
 *
 * Compartilhada (RN-074, T-124d): os avatares de quem divide, a folha de convidar (só o dono, que
 * também é o único que edita o nome e exclui), "Sair da lista" para quem recebeu, e a lista muda na
 * hora quando outra pessoa mexe. Com `ver`, a lista não tem caixas, campo nem "Finalizar".
 */
export default function TelaLista() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fuso = useFusoDoUsuario();
  const consulta = useLista(id);
  const adicionar = useAdicionarItem(id);
  const atualizar = useAtualizarItem(id);
  const [novoItem, definirNovoItem] = useState('');
  const [editando, definirEditando] = useState<ItemLista | null>(null);
  const [finalizando, definirFinalizando] = useState(false);
  const [compartilhando, definirCompartilhando] = useState(false);
  const compartilhamentos = useCompartilhamentos();
  const lista = consulta.data;
  useListaAoVivo(
    id,
    lista !== undefined && (lista.acesso !== 'dono' || lista.compartilhadaCom > 0),
  );

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/listas');
  }

  if (lista === undefined) {
    const naoEncontrada = consulta.error instanceof ErroApi && consulta.error.status === 404;
    return (
      <Tela className="gap-4 px-4 pt-2">
        <Cabecalho titulo={t('listas.titulo')} aoVoltar={voltar} />
        {consulta.isPending ? (
          <Skeleton altura={180} />
        ) : naoEncontrada ? (
          <Texto cor="suave">{t('listas.naoEncontrada')}</Texto>
        ) : (
          <Erro aoTentarDeNovo={() => void consulta.refetch()} />
        )}
      </Tela>
    );
  }

  const ehDono = lista.acesso === 'dono';
  const aberta = lista.finalizadaEm === null;
  const editavel = aberta && lista.acesso !== 'ver';
  const enviados = ehDono ? enviadosDoRecurso(compartilhamentos.data, 'lista', id) : [];
  const erro = adicionar.error ?? atualizar.error;

  function adicionarItem() {
    const nome = novoItem.trim();
    if (nome === '' || adicionar.isPending) return;
    adicionar.mutate(
      { nome },
      {
        onSuccess: () => {
          definirNovoItem('');
        },
      },
    );
  }

  function editar() {
    router.push({ pathname: '/listas/[id]/editar', params: { id } });
  }

  return (
    <Tela className="px-4 pt-2">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Cabecalho
          titulo={t('listas.titulo')}
          aoVoltar={voltar}
          acao={
            ehDono ? (
              <View className="flex-row gap-2">
                <BotaoIcone
                  icone="user-plus"
                  comFundo
                  rotulo={t('compartilhamentos.compartilhar')}
                  aoPressionar={() => {
                    definirCompartilhando(true);
                  }}
                />
                <BotaoIcone
                  icone="pencil"
                  comFundo
                  rotulo={t('listas.editar')}
                  aoPressionar={editar}
                />
              </View>
            ) : undefined
          }
        />
        <ScrollView contentContainerClassName="gap-4 pb-8 pt-3" keyboardShouldPersistTaps="handled">
          <ResumoDaLista lista={lista} fuso={fuso} />
          <PessoasDoRecurso
            recurso="lista"
            acesso={lista.acesso}
            dono={lista.dono}
            quantidade={lista.compartilhadaCom}
            nomes={nomesDasPessoas(lista.dono, enviados)}
            aoPressionar={
              ehDono
                ? () => {
                    definirCompartilhando(true);
                  }
                : undefined
            }
          />

          <Card className="py-2">
            {lista.itens.map((item, indice) => (
              <ItemDaLista
                key={item.id}
                item={item}
                separado={indice > 0}
                aoMarcar={
                  editavel
                    ? (comprado) => {
                        atualizar.mutate({ id: item.id, dados: { comprado } });
                      }
                    : null
                }
                aoEditar={
                  editavel
                    ? () => {
                        definirEditando(item);
                      }
                    : null
                }
              />
            ))}
            {editavel ? (
              <View
                className={
                  lista.itens.length > 0
                    ? 'flex-row items-end gap-2 border-t border-borda pt-3'
                    : 'flex-row items-end gap-2'
                }
              >
                <View className="flex-1">
                  <Campo
                    rotulo={t('listas.adicionar.rotulo')}
                    placeholder={t('listas.adicionar.placeholder')}
                    value={novoItem}
                    onChangeText={definirNovoItem}
                    onSubmitEditing={adicionarItem}
                    submitBehavior="submit"
                    returnKeyType="done"
                    maxLength={120}
                  />
                </View>
                <BotaoIcone
                  icone="plus"
                  comFundo
                  rotulo={t('listas.adicionar.botao')}
                  aoPressionar={adicionarItem}
                />
              </View>
            ) : null}
          </Card>

          {erro ? (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {mensagemDeErro(erro, t('listas.semConexao'))}
            </Texto>
          ) : null}

          {editavel ? (
            <View className="gap-2">
              <Botao
                titulo={t('listas.finalizar.botao')}
                larguraTotal
                desabilitado={lista.quantidadeComprados === 0}
                aoPressionar={() => {
                  definirFinalizando(true);
                }}
              />
              {lista.quantidadeComprados === 0 ? (
                <Texto variante="corpo-sm" cor="suave" className="text-center">
                  {t('listas.finalizar.dica')}
                </Texto>
              ) : null}
            </View>
          ) : lista.transacaoId === null ? null : (
            <Botao
              titulo={t('listas.verDespesa')}
              variante="secundaria"
              icone="receipt"
              larguraTotal
              aoPressionar={() => {
                router.push({
                  pathname: '/transacoes/[id]',
                  params: { id: lista.transacaoId ?? '' },
                });
              }}
            />
          )}
          {lista.dono === null ? null : (
            <BotaoSair
              recurso="lista"
              recursoId={id}
              donoNome={lista.dono.nome}
              aoSair={() => {
                router.dismissTo('/listas');
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <FolhaItem
        listaId={id}
        item={editando}
        aoFechar={() => {
          definirEditando(null);
        }}
      />
      {ehDono ? (
        <FolhaCompartilhar
          recurso="lista"
          recursoId={id}
          visivel={compartilhando}
          aoFechar={() => {
            definirCompartilhando(false);
          }}
        />
      ) : null}
      <FolhaFinalizar
        lista={lista}
        visivel={finalizando}
        aoFechar={() => {
          definirFinalizando(false);
        }}
      />
    </Tela>
  );
}
