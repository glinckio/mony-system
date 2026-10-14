import { agirMony, ErroApi, lerNfceMony, type PedidoAcaoMonyDto } from '@mony/api-client';
import type { EventoMony, OpcaoBotao } from '@mony/shared/mony';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { OrigemDocumento } from '@/features/mony/components/folha-documento';
import { TIPO_CONTEUDO_GRAVACAO } from '@/features/mony/lib/gravador';
import {
  type Mensagem,
  semOTocado,
  type TipoArquivo,
  type Toque,
} from '@/features/mony/lib/mensagens';
import {
  enviarAnexo,
  escolherFoto,
  escolherPdf,
  FalhaAnexo,
} from '@/features/transacoes/lib/anexos';
import { chaveDoToque, enviarMensagemMony } from '@/lib/mony/conversa';

/**
 * A conversa da tela (doc 04, T-069): as mensagens desta abertura sobre o histórico, o envio de
 * texto, voz (T-064), foto e PDF (T-065) com a resposta em SSE, o QR Code do cupom fiscal (T-066b)
 * e o toque nos botões (RN-084), que também vale para as mensagens do histórico.
 *
 * `historico`: as mensagens da API, da mais nova para a mais antiga. Devolve tudo na mesma ordem,
 * com as desta abertura na frente.
 */
export function useChatMony(historico: readonly Mensagem[]) {
  const { t } = useTranslation();
  const [novas, definirNovas] = useState<Mensagem[]>([]);
  // As mensagens do histórico mudam só quando um botão delas é tocado.
  const [mudadas, definirMudadas] = useState<Readonly<Record<string, Mensagem>>>({});
  const [ocupada, definirOcupada] = useState(false);
  const ultimoId = useRef(0);

  const mensagens = [
    ...[...novas].reverse(),
    ...historico.map((mensagem) => mudadas[mensagem.id] ?? mensagem),
  ];

  function nova(autor: Mensagem['autor'], conteudo = '', arquivo: TipoArquivo | null = null) {
    ultimoId.current += 1;
    return {
      id: `local-${String(ultimoId.current)}`,
      autor,
      texto: conteudo,
      componentes: [],
      erro: false,
      arquivo,
    } satisfies Mensagem;
  }

  /** Aviso da Mony sem ida à API (microfone negado, gravação que falhou). */
  function avisar(conteudo: string) {
    definirNovas((lista) => [...lista, { ...nova('mony', conteudo), erro: true }]);
  }

  function atualizar(id: string, mudar: (mensagem: Mensagem) => Mensagem) {
    definirNovas((lista) =>
      lista.map((mensagem) => (mensagem.id === id ? mudar(mensagem) : mensagem)),
    );
    const doHistorico = historico.find((mensagem) => mensagem.id === id);
    if (doHistorico) {
      definirMudadas((atuais) => ({ ...atuais, [id]: mudar(atuais[id] ?? doHistorico) }));
    }
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
    if (toque) {
      atualizar(toque.mensagemId, (mensagem) => ({
        ...mensagem,
        componentes: semOTocado(mensagem.componentes, toque),
      }));
    }
    definirNovas((lista) => [...lista, minha, resposta]);
    definirOcupada(true);
    try {
      await pedir(resposta.id);
    } catch (erro) {
      falhou(resposta.id, erro);
    } finally {
      definirOcupada(false);
    }
  }

  async function enviarTexto(texto: string) {
    const conteudo = texto.trim();
    if (conteudo === '' || ocupada) return;
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
  async function enviarDocumento(origem: OrigemDocumento) {
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

  /**
   * QR Code do cupom fiscal (T-066b): o conteúdo lido vai a `POST /mony/nfce`, e a Mony responde
   * com a compra para confirmar (RN-083), um aviso ou a espera pela Sefaz.
   */
  async function enviarNfce(conteudo: string) {
    if (ocupada) return;
    await conversar(null, nova('usuario', t('mony.nfce.mensagem')), async (respostaId) => {
      const resposta = await lerNfceMony(
        { conteudo },
        { headers: { 'idempotency-key': chaveDoToque() } },
      );
      atualizar(respostaId, (atual) => ({
        ...atual,
        texto: resposta.texto,
        componentes: resposta.componente ? [resposta.componente] : [],
      }));
    });
  }

  /** Toque num botão (RN-084): a ação volta como veio; o componente tocado sai da mensagem. */
  async function tocar(mensagem: Mensagem, indice: number, opcao: OpcaoBotao) {
    if (ocupada) return;
    const toque = { mensagemId: mensagem.id, indice, opcao };
    await conversar(toque, nova('usuario', opcao.rotulo), async (respostaId) => {
      const resposta = await agirMony(
        { acao: opcao.acao as PedidoAcaoMonyDto['acao'] },
        { headers: { 'idempotency-key': chaveDoToque() } },
      );
      atualizar(respostaId, (atual) => ({
        ...atual,
        texto: resposta.texto,
        componentes: resposta.componente ? [resposta.componente] : [],
      }));
    });
  }

  return {
    mensagens,
    ocupada,
    /** Nada nesta abertura: a tela mostra o histórico ou as boas-vindas. */
    semNovas: novas.length === 0,
    avisar,
    enviarTexto,
    enviarAudio,
    enviarDocumento,
    enviarNfce,
    tocar,
  };
}
