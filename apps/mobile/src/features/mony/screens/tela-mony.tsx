import { linkDoBotao, type OpcaoBotao } from '@mony/shared/mony';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';

import { Atalhos } from '@/features/mony/components/atalhos';
import { Balao } from '@/features/mony/components/balao';
import { FolhaBusca } from '@/features/mony/components/folha-busca';
import { FolhaDocumento } from '@/features/mony/components/folha-documento';
import { LeitorQr } from '@/features/mony/components/leitor-qr';
import { useChatMony } from '@/features/mony/hooks/use-chat-mony';
import { useHistoricoMony } from '@/features/mony/hooks/use-conversa-mony';
import { duracaoParaTexto, useGravador } from '@/features/mony/lib/gravador';
import { daConversa, type Mensagem } from '@/features/mony/lib/mensagens';
import { Dica } from '@/features/onboarding/components/dica';
import { rotaDoLink } from '@/lib/links-internos';
import { Botao, BotaoIcone, Campo, cores, Icone, Tela, Texto } from '@/ui';

/**
 * Chat da Mony (doc 04, T-069): abre com o histórico (`GET /mony/conversa`, mais antigas ao subir),
 * a resposta chega em SSE e aparece enquanto é escrita, os botões respondem sem texto livre
 * (RN-084), inclusive os do histórico. Com o campo vazio, os atalhos da API, o clipe (foto, print
 * ou PDF, T-065) e o microfone (T-064). A lupa busca no histórico. O botão que só abre uma tela
 * ([Ver planos], RN-123) abre a tela, sem ir à API.
 */
export default function TelaMony() {
  const { t } = useTranslation();
  const router = useRouter();
  const historico = useHistoricoMony();
  const doServidor = (historico.data?.pages ?? []).flatMap(({ itens }) => itens.map(daConversa));
  const sugestoes = historico.data?.pages[0]?.sugestoes ?? [];
  const chat = useChatMony(doServidor);
  const [texto, definirTexto] = useState('');
  const [escolhendo, definirEscolhendo] = useState(false);
  const [lendoQr, definirLendoQr] = useState(false);
  const [buscando, definirBuscando] = useState(false);

  // No limite de 10 minutos, o gravador envia sozinho.
  const gravacao = useGravador((uri) => void chat.enviarAudio(uri));

  function tocar(mensagem: Mensagem, indice: number, opcao: OpcaoBotao) {
    const link = linkDoBotao(opcao.acao);
    if (link === null) {
      void chat.tocar(mensagem, indice, opcao);
      return;
    }
    const rota = rotaDoLink(link);
    if (rota !== null) router.push(rota);
  }

  async function enviar(conteudo = texto) {
    if (conteudo.trim() === '' || chat.ocupada) return;
    definirTexto('');
    await chat.enviarTexto(conteudo);
  }

  async function gravar() {
    if (chat.ocupada || gravacao.gravando) return;
    try {
      if ((await gravacao.comecar()) === 'semPermissao') chat.avisar(t('mony.audio.semPermissao'));
    } catch {
      chat.avisar(t('mony.audio.falhou'));
    }
  }

  async function terminarGravacao() {
    let uri: string | null;
    try {
      uri = await gravacao.parar();
    } catch {
      chat.avisar(t('mony.audio.falhou'));
      return;
    }
    if (uri) await chat.enviarAudio(uri);
  }

  const vazia = chat.mensagens.length === 0;
  const livre = texto.trim() === '' && !chat.ocupada;

  return (
    <Tela degrade={false}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-row items-center justify-between px-4 pt-4">
          <Texto variante="titulo-lg" accessibilityRole="header">
            {t('mony.titulo')}
          </Texto>
          <BotaoIcone
            icone="search"
            rotulo={t('mony.busca.abrir')}
            aoPressionar={() => {
              definirBuscando(true);
            }}
          />
        </View>
        {historico.isError ? (
          <View className="flex-row items-center gap-2 px-4">
            <Texto variante="corpo-sm" cor="perigo" className="flex-1">
              {t('mony.historico.erro')}
            </Texto>
            <Botao
              variante="fantasma"
              compacto
              titulo={t('mony.historico.tentarDeNovo')}
              aoPressionar={() => void historico.refetch()}
            />
          </View>
        ) : null}
        {vazia ? (
          <View className="flex-1 gap-3 p-4">
            <Dica chave="mony.primeira-conversa" />
            {historico.isPending ? (
              <ActivityIndicator color={cores.texto} />
            ) : (
              <Texto cor="suave">{t('mony.boasVindas')}</Texto>
            )}
          </View>
        ) : (
          // Invertida: a mais nova embaixo, e as mais antigas chegam ao subir até o topo.
          <FlatList
            inverted
            testID="mony-lista"
            data={chat.mensagens}
            keyExtractor={(mensagem) => mensagem.id}
            className="flex-1"
            contentContainerClassName="gap-3 p-4"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Balao
                mensagem={item}
                aoTocar={(indice, opcao) => {
                  tocar(item, indice, opcao);
                }}
              />
            )}
            onEndReached={() => {
              if (historico.hasNextPage && !historico.isFetchingNextPage) {
                void historico.fetchNextPage();
              }
            }}
            ListFooterComponent={
              historico.isFetchingNextPage ? <ActivityIndicator color={cores.texto} /> : null
            }
          />
        )}
        {livre && !gravacao.gravando ? (
          <Atalhos sugestoes={sugestoes} aoEscolher={(sugestao) => void enviar(sugestao)} />
        ) : null}
        {gravacao.gravando ? (
          <View className="flex-row items-center gap-2 bg-fundo p-3">
            <BotaoIcone
              icone="x"
              rotulo={t('mony.audio.cancelar')}
              aoPressionar={() => void gravacao.parar().catch(() => null)}
            />
            <View className="flex-1 flex-row items-center gap-2">
              <Icone nome="mic" cor={cores.perigo} />
              <Texto accessibilityLiveRegion="polite">
                {t('mony.audio.gravando', { duracao: duracaoParaTexto(gravacao.segundos) })}
              </Texto>
            </View>
            <Botao
              titulo={t('mony.audio.enviar')}
              icone="send-horizontal"
              aoPressionar={() => void terminarGravacao()}
            />
          </View>
        ) : (
          <View className="flex-row items-end gap-2 bg-fundo p-3">
            <View className="flex-1">
              <Campo
                rotulo={t('mony.campo')}
                placeholder={t('mony.exemplo')}
                value={texto}
                onChangeText={definirTexto}
                returnKeyType="send"
                onSubmitEditing={() => void enviar()}
                testID="mony-campo"
              />
            </View>
            {livre ? (
              <>
                <BotaoIcone
                  icone="paperclip"
                  rotulo={t('mony.documento.anexar')}
                  aoPressionar={() => {
                    definirEscolhendo(true);
                  }}
                  comFundo
                />
                <BotaoIcone
                  icone="mic"
                  rotulo={t('mony.audio.gravar')}
                  aoPressionar={() => void gravar()}
                  comFundo
                />
              </>
            ) : (
              <Botao
                titulo={t('mony.enviar')}
                aoPressionar={() => void enviar()}
                desabilitado={texto.trim() === ''}
                carregando={chat.ocupada}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
      <FolhaDocumento
        visivel={escolhendo}
        aoFechar={() => {
          definirEscolhendo(false);
        }}
        aoEscolher={(origem) => {
          definirEscolhendo(false);
          void chat.enviarDocumento(origem);
        }}
        aoLerQr={() => {
          definirEscolhendo(false);
          definirLendoQr(true);
        }}
      />
      <LeitorQr
        visivel={lendoQr}
        aoFechar={() => {
          definirLendoQr(false);
        }}
        aoLer={(conteudo) => void chat.enviarNfce(conteudo)}
      />
      <FolhaBusca
        visivel={buscando}
        aoFechar={() => {
          definirBuscando(false);
        }}
      />
    </Tela>
  );
}
