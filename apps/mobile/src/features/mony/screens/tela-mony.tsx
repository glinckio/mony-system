import { agirMony, ErroApi, type PedidoAcaoMonyDto } from '@mony/api-client';
import type { ComponenteMony, EventoMony, OpcaoBotao, ResumoLancamento } from '@mony/shared/mony';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import {
  duracaoParaTexto,
  TIPO_CONTEUDO_GRAVACAO,
  useGravador,
} from '@/features/mony/lib/gravador';
import { Dica } from '@/features/onboarding/components/dica';
import {
  enviarAnexo,
  escolherFoto,
  escolherPdf,
  FalhaAnexo,
} from '@/features/transacoes/lib/anexos';
import { useDataCurta } from '@/lib/datas-texto';
import { chaveDoToque, enviarMensagemMony } from '@/lib/mony/conversa';
import {
  Botao,
  BotaoIcone,
  Campo,
  Card,
  Chip,
  cores,
  Folha,
  Icone,
  type NomeIcone,
  juntarClasses,
  Tela,
  Texto,
  useTextoDoValor,
} from '@/ui';

interface Mensagem {
  id: string;
  autor: 'usuario' | 'mony';
  texto: string;
  /** Botões de pergunta ou confirmação e cartões de resumo (RN-082), na ordem em que chegaram. */
  componentes: ComponenteMony[];
  erro: boolean;
  /**
   * O arquivo da mensagem da pessoa: voz (T-064), com o texto que a Mony entendeu, ou foto e PDF
   * (T-065), que a Mony lê e devolve como lançamentos a confirmar.
   */
  arquivo: TipoArquivo | null;
}

type TipoArquivo = 'audio' | 'foto' | 'pdf';

const ICONE_ARQUIVO: Record<TipoArquivo, NomeIcone> = {
  audio: 'mic',
  foto: 'camera',
  pdf: 'paperclip',
};

/** O botão tocado: a mensagem e o componente dela. */
interface Toque {
  mensagemId: string;
  indice: number;
  opcao: OpcaoBotao;
}

/**
 * Tira da mensagem o componente tocado (a pergunta respondida, o resumo desfeito, o lançamento lido
 * confirmado). [Confirmar todos] e [Descartar todos] tiram os cartões da mesma leitura; sem
 * cartão, o [Confirmar todos] sai também.
 */
function semOTocado(componentes: readonly ComponenteMony[], toque: Toque): ComponenteMony[] {
  const importacao = (componente: ComponenteMony) =>
    componente.opcoes.find(({ acao }) => typeof acao.importacaoId === 'string')?.acao.importacaoId;
  const daLeitura = toque.opcao.acao.importacaoId;
  const todos = typeof daLeitura === 'string' && toque.opcao.acao.indice === null;
  const restantes = componentes.filter(
    (componente, indice) =>
      indice !== toque.indice && !(todos && importacao(componente) === daLeitura),
  );
  if (typeof daLeitura !== 'string') return restantes;
  const cartoes = restantes.some(
    (componente) => componente.tipo === 'resumo' && importacao(componente) === daLeitura,
  );
  return cartoes
    ? restantes
    : restantes.filter((componente) => importacao(componente) !== daLeitura);
}

/**
 * Chat da Mony (PoC T-020, doc 04): a resposta chega em SSE e aparece enquanto é escrita; os
 * botões respondem a pergunta sem texto livre (RN-084). Com o campo vazio, o microfone grava uma
 * mensagem de voz (T-064). A tela completa é a T-069.
 */
export default function TelaMony() {
  const { t } = useTranslation();
  const [mensagens, definirMensagens] = useState<Mensagem[]>([]);
  const [texto, definirTexto] = useState('');
  const [ocupada, definirOcupada] = useState(false);
  const [escolhendo, definirEscolhendo] = useState(false);
  const ultimoId = useRef(0);
  const rolagem = useRef<ScrollView>(null);

  function nova(
    autor: Mensagem['autor'],
    conteudo = '',
    arquivo: TipoArquivo | null = null,
  ): Mensagem {
    ultimoId.current += 1;
    return {
      id: String(ultimoId.current),
      autor,
      texto: conteudo,
      componentes: [],
      erro: false,
      arquivo,
    };
  }

  /** Aviso da Mony sem ida à API (microfone negado, gravação que falhou). */
  function avisar(conteudo: string) {
    definirMensagens((lista) => [...lista, { ...nova('mony', conteudo), erro: true }]);
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
      atualizar(id, (mensagem) => ({
        ...mensagem,
        componentes: [...mensagem.componentes, evento.componente],
      }));
    } else if (evento.tipo === 'erro') {
      atualizar(id, (mensagem) => ({ ...mensagem, texto: evento.mensagem, erro: true }));
    }
  }

  function falhou(id: string, erro: unknown) {
    const mensagem =
      erro instanceof ErroApi
        ? erro.message
        : erro instanceof FalhaAnexo
          ? t(`mony.documento.erros.${erro.motivo}`)
          : t('mony.semConexao');
    atualizar(id, (atual) => ({ ...atual, texto: mensagem, erro: true }));
  }

  async function conversar(
    toque: Toque | null,
    minha: Mensagem,
    pedir: (respostaId: string) => Promise<void>,
  ) {
    const resposta = nova('mony');
    definirMensagens((lista) => [
      ...lista.map((mensagem) =>
        toque && mensagem.id === toque.mensagemId
          ? { ...mensagem, componentes: semOTocado(mensagem.componentes, toque) }
          : mensagem,
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
      enviarMensagemMony({ texto: conteudo }, (evento) => {
        aplicar(respostaId, evento);
      }),
    );
  }

  /** Envia o áudio ao S3 (`POST /arquivos`) e o id à Mony; a transcrição vira o texto do balão. */
  async function enviarAudio(uri: string) {
    const minha = nova('usuario', t('mony.audio.entendendo'), 'audio');
    const progresso = { transcrito: false };
    await conversar(null, minha, async (respostaId) => {
      try {
        const { id } = await enviarAnexo({
          uri,
          tipo: 'audio',
          tipoConteudo: TIPO_CONTEUDO_GRAVACAO,
        });
        await enviarMensagemMony({ arquivoId: id }, (evento) => {
          if (evento.tipo === 'transcricao') {
            progresso.transcrito = true;
            atualizar(minha.id, (mensagem) => ({ ...mensagem, texto: evento.texto }));
          } else {
            aplicar(respostaId, evento);
          }
        });
      } finally {
        if (!progresso.transcrito) {
          atualizar(minha.id, (mensagem) => ({ ...mensagem, texto: '' }));
        }
      }
    });
  }

  /**
   * Foto, print ou PDF (T-065): sobe ao S3 e vai à Mony, que responde com os lançamentos lidos para
   * confirmar (RN-083).
   */
  async function enviarDocumento(origem: 'camera' | 'galeria' | 'pdf') {
    definirEscolhendo(false);
    if (ocupada) return;
    let arquivo: Awaited<ReturnType<typeof escolherPdf>>;
    try {
      arquivo = origem === 'pdf' ? await escolherPdf() : await escolherFoto(origem);
    } catch (erro) {
      avisar(t(`mony.documento.erros.${erro instanceof FalhaAnexo ? erro.motivo : 'envio'}`));
      return;
    }
    if (arquivo === null) return;
    const escolhido = arquivo;
    const tipo = escolhido.tipo === 'pdf' ? 'pdf' : 'foto';
    await conversar(null, nova('usuario', '', tipo), async (respostaId) => {
      const { id } = await enviarAnexo(escolhido);
      await enviarMensagemMony({ arquivoId: id }, (evento) => {
        aplicar(respostaId, evento);
      });
    });
  }

  // Depois de `enviarAudio`: no limite de 10 minutos, o gravador envia sozinho.
  const gravacao = useGravador((uri) => void enviarAudio(uri));

  async function gravar() {
    if (ocupada || gravacao.gravando) return;
    try {
      if ((await gravacao.comecar()) === 'semPermissao') avisar(t('mony.audio.semPermissao'));
    } catch {
      avisar(t('mony.audio.falhou'));
    }
  }

  async function terminarGravacao() {
    let uri: string | null;
    try {
      uri = await gravacao.parar();
    } catch {
      avisar(t('mony.audio.falhou'));
      return;
    }
    if (uri) await enviarAudio(uri);
  }

  async function cancelarGravacao() {
    await gravacao.parar().catch(() => null);
  }

  async function tocar(pergunta: Mensagem, indice: number, opcao: OpcaoBotao) {
    if (ocupada) return;
    const toque = { mensagemId: pergunta.id, indice, opcao };
    await conversar(toque, nova('usuario', opcao.rotulo), async (respostaId) => {
      const resposta = await agirMony(
        { acao: opcao.acao as PedidoAcaoMonyDto['acao'] },
        { headers: { 'idempotency-key': chaveDoToque() } },
      );
      atualizar(respostaId, (mensagem) => ({
        ...mensagem,
        texto: resposta.texto,
        componentes: resposta.componente ? [resposta.componente] : [],
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
              aoTocar={(indice, opcao) => void tocar(mensagem, indice, opcao)}
            />
          ))}
        </ScrollView>
        {gravacao.gravando ? (
          <View className="flex-row items-center gap-2 bg-fundo p-3">
            <BotaoIcone
              icone="x"
              rotulo={t('mony.audio.cancelar')}
              aoPressionar={() => void cancelarGravacao()}
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
              />
            </View>
            {texto.trim() === '' && !ocupada ? (
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
                carregando={ocupada}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
      <Folha
        visivel={escolhendo}
        titulo={t('mony.documento.titulo')}
        aoFechar={() => {
          definirEscolhendo(false);
        }}
      >
        <View className="gap-2">
          <Texto cor="suave">{t('mony.documento.ajuda')}</Texto>
          <Botao
            variante="secundaria"
            icone="camera"
            larguraTotal
            titulo={t('mony.documento.camera')}
            aoPressionar={() => void enviarDocumento('camera')}
          />
          <Botao
            variante="secundaria"
            icone="scan-text"
            larguraTotal
            titulo={t('mony.documento.galeria')}
            aoPressionar={() => void enviarDocumento('galeria')}
          />
          <Botao
            variante="secundaria"
            icone="paperclip"
            larguraTotal
            titulo={t('mony.documento.pdf')}
            aoPressionar={() => void enviarDocumento('pdf')}
          />
        </View>
      </Folha>
    </Tela>
  );
}

function Balao({
  mensagem,
  aoTocar,
}: {
  mensagem: Mensagem;
  aoTocar: (indice: number, opcao: OpcaoBotao) => void;
}) {
  const { t } = useTranslation();
  const minha = mensagem.autor === 'usuario';
  const semTexto = mensagem.texto === '' && !mensagem.erro && mensagem.arquivo === null;
  const escrevendo = !minha && semTexto && mensagem.componentes.length === 0;
  return (
    <View className={juntarClasses('gap-2', minha ? 'items-end' : 'items-start')}>
      {semTexto && !escrevendo ? null : (
        <View
          style={{ maxWidth: '85%' }}
          className={juntarClasses(
            'rounded-md px-4 py-3',
            minha && 'bg-balao-usuario',
            !minha && !mensagem.erro && 'bg-superficie-alta',
            mensagem.erro && 'bg-perigo-suave',
          )}
        >
          {mensagem.arquivo ? (
            <View className="flex-row items-center gap-1">
              <Icone
                nome={ICONE_ARQUIVO[mensagem.arquivo]}
                tamanho={14}
                cor={cores['texto-suave']}
              />
              <Texto variante="corpo-sm" cor="suave">
                {t(`mony.arquivo.${mensagem.arquivo}`)}
              </Texto>
            </View>
          ) : null}
          {mensagem.texto === '' && !escrevendo ? null : (
            <Texto
              cor={minha ? 'texto' : mensagem.erro ? 'perigo' : escrevendo ? 'suave' : 'texto'}
            >
              {escrevendo ? t('mony.escrevendo') : mensagem.texto}
            </Texto>
          )}
        </View>
      )}
      {mensagem.componentes.map((componente, indice) =>
        componente.tipo === 'resumo' ? (
          <CartaoResumo
            // Os componentes não guardam estado: o índice basta como chave.
            key={indice}
            lancamento={componente.lancamento}
            aConfirmar={componente.aConfirmar ?? false}
            opcoes={componente.opcoes}
            aoTocar={(opcao) => {
              aoTocar(indice, opcao);
            }}
          />
        ) : (
          <Opcoes
            key={indice}
            opcoes={componente.opcoes}
            aoTocar={(opcao) => {
              aoTocar(indice, opcao);
            }}
          />
        ),
      )}
    </View>
  );
}

function Opcoes({
  opcoes,
  aoTocar,
}: {
  opcoes: readonly OpcaoBotao[];
  aoTocar: (opcao: OpcaoBotao) => void;
}) {
  if (opcoes.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2">
      {opcoes.map((opcao) => (
        <Chip
          key={opcao.id}
          rotulo={opcao.rotulo}
          aoPressionar={() => {
            aoTocar(opcao);
          }}
        />
      ))}
    </View>
  );
}

/** O que a Mony gravou (RN-082): valor, descrição, categoria, data e forma, com o [Desfazer]. */
function CartaoResumo({
  lancamento,
  aConfirmar,
  opcoes,
  aoTocar,
}: {
  lancamento: ResumoLancamento;
  /** Lido de foto ou PDF e ainda não gravado (RN-083): o que falta aparece "a escolher". */
  aConfirmar: boolean;
  opcoes: readonly OpcaoBotao[];
  aoTocar: (opcao: OpcaoBotao) => void;
}) {
  const { t } = useTranslation();
  const textoDoValor = useTextoDoValor();
  const dataCurta = useDataCurta();
  const forma = lancamento.cartao
    ? lancamento.parcelas
      ? t('mony.resumo.cartaoParcelado', {
          cartao: lancamento.cartao,
          parcelas: String(lancamento.parcelas),
          valor: textoDoValor(lancamento.valorParcelaCentavos ?? 0),
        })
      : lancamento.cartao
    : lancamento.formaPagamento
      ? t(`transacoes.formas.${lancamento.formaPagamento}`)
      : aConfirmar && lancamento.tipo === 'despesa'
        ? t('mony.resumo.formaAEscolher')
        : null;
  const categoria =
    lancamento.categoria ?? (aConfirmar ? t('mony.resumo.categoriaAEscolher') : null);
  return (
    <Card className="gap-2" style={{ maxWidth: '85%' }} testID="mony-resumo">
      <Texto variante="corpo-sm" cor="suave">
        {aConfirmar
          ? t(
              lancamento.tipo === 'receita'
                ? 'mony.resumo.receitaAConfirmar'
                : 'mony.resumo.despesaAConfirmar',
            )
          : t(lancamento.tipo === 'receita' ? 'mony.resumo.receita' : 'mony.resumo.despesa')}
      </Texto>
      <Texto className="font-forte">
        {`${textoDoValor(lancamento.valorCentavos)} · ${lancamento.descricao}`}
      </Texto>
      <Texto variante="corpo-sm" cor="suave">
        {[categoria, dataCurta(lancamento.data), forma].filter(Boolean).join(' · ')}
      </Texto>
      <Opcoes opcoes={opcoes} aoTocar={aoTocar} />
    </Card>
  );
}
