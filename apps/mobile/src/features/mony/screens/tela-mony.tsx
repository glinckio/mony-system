import { agirMony, ErroApi, type PedidoAcaoMonyDto } from '@mony/api-client';
import type { EventoMony, OpcaoBotao } from '@mony/shared/mony';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Dica } from '@/features/onboarding/components/dica';
import { chaveDoToque, enviarMensagemMony } from '@/lib/mony/conversa';
import { Botao, Campo, Chip, juntarClasses, Tela, Texto } from '@/ui';

interface Mensagem {
  id: string;
  autor: 'usuario' | 'mony';
  texto: string;
  botoes: OpcaoBotao[];
  erro: boolean;
}

/**
 * Chat da Mony (PoC T-020, doc 04): a resposta chega em SSE e aparece enquanto é escrita; os
 * botões respondem a pergunta sem texto livre (RN-084). A tela completa é a T-069.
 */
export default function TelaMony() {
  const { t } = useTranslation();
  const [mensagens, definirMensagens] = useState<Mensagem[]>([]);
  const [texto, definirTexto] = useState('');
  const [ocupada, definirOcupada] = useState(false);
  const ultimoId = useRef(0);
  const rolagem = useRef<ScrollView>(null);

  function nova(autor: Mensagem['autor'], conteudo = ''): Mensagem {
    ultimoId.current += 1;
    return { id: String(ultimoId.current), autor, texto: conteudo, botoes: [], erro: false };
  }

  function atualizar(id: string, mudar: (mensagem: Mensagem) => Mensagem) {
    definirMensagens((lista) =>
      lista.map((mensagem) => (mensagem.id === id ? mudar(mensagem) : mensagem)),
    );
  }

  function aplicar(id: string, evento: EventoMony) {
    if (evento.tipo === 'texto.delta') {
      atualizar(id, (mensagem) => ({ ...mensagem, texto: mensagem.texto + evento.texto }));
    } else if (evento.tipo === 'componente') {
      atualizar(id, (mensagem) => ({ ...mensagem, botoes: evento.componente.opcoes }));
    } else if (evento.tipo === 'erro') {
      atualizar(id, (mensagem) => ({ ...mensagem, texto: evento.mensagem, erro: true }));
    }
  }

  function falhou(id: string, erro: unknown) {
    const mensagem = erro instanceof ErroApi ? erro.message : t('mony.semConexao');
    atualizar(id, (atual) => ({ ...atual, texto: mensagem, erro: true }));
  }

  async function conversar(
    perguntaId: string | null,
    minha: Mensagem,
    pedir: (respostaId: string) => Promise<void>,
  ) {
    const resposta = nova('mony');
    definirMensagens((lista) => [
      ...lista.map((mensagem) =>
        mensagem.id === perguntaId ? { ...mensagem, botoes: [] } : mensagem,
      ),
      minha,
      resposta,
    ]);
    definirOcupada(true);
    try {
      await pedir(resposta.id);
    } catch (erro) {
      falhou(resposta.id, erro);
    } finally {
      definirOcupada(false);
    }
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (conteudo === '' || ocupada) return;
    definirTexto('');
    await conversar(null, nova('usuario', conteudo), (respostaId) =>
      enviarMensagemMony(conteudo, (evento) => {
        aplicar(respostaId, evento);
      }),
    );
  }

  async function tocar(pergunta: Mensagem, opcao: OpcaoBotao) {
    if (ocupada) return;
    await conversar(pergunta.id, nova('usuario', opcao.rotulo), async (respostaId) => {
      const resposta = await agirMony(
        { acao: opcao.acao as PedidoAcaoMonyDto['acao'] },
        { headers: { 'idempotency-key': chaveDoToque() } },
      );
      atualizar(respostaId, (mensagem) => ({
        ...mensagem,
        texto: resposta.texto,
        botoes: resposta.componente?.opcoes ?? [],
      }));
    });
  }

  return (
    <Tela degrade={false}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Texto variante="titulo-lg" accessibilityRole="header" className="px-4 pt-4">
          {t('mony.titulo')}
        </Texto>
        <ScrollView
          ref={rolagem}
          className="flex-1"
          contentContainerClassName="gap-3 p-4"
          onContentSizeChange={() => rolagem.current?.scrollToEnd({ animated: true })}
        >
          <Dica chave="mony.primeira-conversa" />
          {mensagens.length === 0 ? <Texto cor="suave">{t('mony.boasVindas')}</Texto> : null}
          {mensagens.map((mensagem) => (
            <Balao
              key={mensagem.id}
              mensagem={mensagem}
              aoTocar={(opcao) => void tocar(mensagem, opcao)}
            />
          ))}
        </ScrollView>
        <View className="flex-row items-end gap-2 bg-fundo p-3">
          <View className="flex-1">
            <Campo
              rotulo={t('mony.campo')}
              placeholder={t('mony.exemplo')}
              value={texto}
              onChangeText={definirTexto}
              returnKeyType="send"
              onSubmitEditing={() => void enviar()}
            />
          </View>
          <Botao
            titulo={t('mony.enviar')}
            aoPressionar={() => void enviar()}
            desabilitado={texto.trim() === ''}
            carregando={ocupada}
          />
        </View>
      </KeyboardAvoidingView>
    </Tela>
  );
}

function Balao({
  mensagem,
  aoTocar,
}: {
  mensagem: Mensagem;
  aoTocar: (opcao: OpcaoBotao) => void;
}) {
  const { t } = useTranslation();
  const minha = mensagem.autor === 'usuario';
  const escrevendo = !minha && mensagem.texto === '' && !mensagem.erro;
  return (
    <View className={juntarClasses('gap-2', minha ? 'items-end' : 'items-start')}>
      <View
        style={{ maxWidth: '85%' }}
        className={juntarClasses(
          'rounded-md px-4 py-3',
          minha && 'bg-balao-usuario',
          !minha && !mensagem.erro && 'bg-superficie-alta',
          mensagem.erro && 'bg-perigo-suave',
        )}
      >
        <Texto cor={minha ? 'texto' : mensagem.erro ? 'perigo' : escrevendo ? 'suave' : 'texto'}>
          {escrevendo ? t('mony.escrevendo') : mensagem.texto}
        </Texto>
      </View>
      {mensagem.botoes.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {mensagem.botoes.map((opcao) => (
            <Chip
              key={opcao.id}
              rotulo={opcao.rotulo}
              aoPressionar={() => {
                aoTocar(opcao);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
