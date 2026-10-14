import {
  ErroPush,
  type MensagemPush,
  PushProvider,
  type ReciboPush,
  type TicketPush,
} from './push.provider';

/** Expo Push Service (https://docs.expo.dev/push-notifications/sending-notifications/). */
export const URL_ENVIO_EXPO = 'https://exp.host/--/api/v2/push/send';
export const URL_RECIBOS_EXPO = 'https://exp.host/--/api/v2/push/getReceipts';

/** Limites do Expo: 100 mensagens por envio e 1000 ids por consulta de recibos. */
const MENSAGENS_POR_ENVIO = 100;
const IDS_POR_CONSULTA = 1000;
const TEMPO_LIMITE_MS = 15_000;

interface RespostaExpo<T> {
  data?: T;
  errors?: { code?: string; message?: string }[];
}

interface TicketExpo {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** O `fetch`, com o que o cliente usa (os testes passam um falso). */
export type Buscar = (url: string, opcoes: RequestInit) => Promise<Response>;

/** Envia pelo Expo, que entrega por FCM e APNs. Com `EXPO_ACCESS_TOKEN`, manda o token também. */
export class PushExpo extends PushProvider {
  constructor(
    private readonly tokenAcesso: string | undefined,
    private readonly buscar: Buscar = fetch,
  ) {
    super();
  }

  async enviar(mensagens: readonly MensagemPush[]): Promise<TicketPush[]> {
    const tickets: TicketPush[] = [];
    for (let inicio = 0; inicio < mensagens.length; inicio += MENSAGENS_POR_ENVIO) {
      const lote = mensagens.slice(inicio, inicio + MENSAGENS_POR_ENVIO);
      const resposta = await this.postar<TicketExpo[]>(
        URL_ENVIO_EXPO,
        lote.map((mensagem) =>
          mensagem.silenciosa === true
            ? // Só dados: o iOS acorda o app com `content-available`; o Android entrega ao app.
              { to: mensagem.para, data: mensagem.dados, priority: 'high', _contentAvailable: true }
            : {
                to: mensagem.para,
                title: mensagem.titulo,
                body: mensagem.corpo,
                data: mensagem.dados,
                sound: 'default',
                priority: 'high',
                channelId: mensagem.canal,
                ...(mensagem.categoria === undefined ? {} : { categoryId: mensagem.categoria }),
              },
        ),
      );
      const recebidos = resposta ?? [];
      lote.forEach((_, indice) => {
        const ticket = recebidos[indice];
        tickets.push(
          ticket?.status === 'ok' && ticket.id !== undefined
            ? { situacao: 'aceita', id: ticket.id }
            : {
                situacao: 'erro',
                erro: ticket?.details?.error ?? 'SemTicket',
                mensagem: ticket?.message ?? 'O Expo não devolveu ticket para a mensagem.',
              },
        );
      });
    }
    return tickets;
  }

  async recibos(ids: readonly string[]): Promise<Map<string, ReciboPush>> {
    const recibos = new Map<string, ReciboPush>();
    for (let inicio = 0; inicio < ids.length; inicio += IDS_POR_CONSULTA) {
      const resposta = await this.postar<Record<string, TicketExpo>>(URL_RECIBOS_EXPO, {
        ids: ids.slice(inicio, inicio + IDS_POR_CONSULTA),
      });
      for (const [id, recibo] of Object.entries(resposta ?? {})) {
        recibos.set(
          id,
          recibo.status === 'ok'
            ? { situacao: 'entregue' }
            : {
                situacao: 'erro',
                erro: recibo.details?.error ?? 'Desconhecido',
                mensagem: recibo.message ?? '',
              },
        );
      }
    }
    return recibos;
  }

  private async postar<T>(url: string, corpo: unknown): Promise<T | undefined> {
    let resposta: Response;
    try {
      resposta = await this.buscar(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
          ...(this.tokenAcesso === undefined
            ? {}
            : { authorization: `Bearer ${this.tokenAcesso}` }),
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new ErroPush(`Expo não respondeu: ${motivo}`, false);
    }
    const texto = await resposta.text().catch(() => '');
    if (!resposta.ok) {
      // 4xx (menos 429) é pedido nosso errado: repetir não resolve. 429 e 5xx passam.
      const permanente = resposta.status < 500 && resposta.status !== 429;
      throw new ErroPush(
        `Expo respondeu ${String(resposta.status)}: ${texto.slice(0, 300)}`,
        permanente,
      );
    }
    const json = JSON.parse(texto) as RespostaExpo<T>;
    if (json.errors && json.errors.length > 0 && json.data === undefined) {
      throw new ErroPush(
        `Expo recusou: ${json.errors.map((erro) => erro.code ?? erro.message).join(', ')}`,
        true,
      );
    }
    return json.data;
  }
}
