import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  CAMINHO_WS,
  esquemaSalaLista,
  EVENTOS_TEMPO_REAL,
  type RespostaSalaLista,
  salaDaLista,
  salaDoUsuario,
} from '@mony/shared/tempo-real';
import type { Server, Socket } from 'socket.io';

import { type UsuarioAutenticado, TokensAcesso } from '../../core/auth/tokens-acesso';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { AvisosTempoReal } from '../../core/tempo-real/avisos-tempo-real';
import { reportarErro } from '../../core/sentry/sentry';
import { CompartilhamentosService } from '../compartilhamentos/compartilhamentos.service';

interface DadosSocket {
  usuario: UsuarioAutenticado;
}

type SocketMony = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  DadosSocket
>;

/**
 * Tempo real das listas (RN-074, T-124b): o app conecta com o token de acesso e entra na sala da
 * lista aberta, se tiver acesso a ela (o mesmo 404 da API para quem não tem). Cada socket também
 * fica na sala do usuário, para sair das listas de que foi removido. O token é conferido só na
 * conexão: os avisos não levam dados, e buscar a lista exige um token válido.
 */
@WebSocketGateway({ path: CAMINHO_WS })
export class ListasGateway implements OnGatewayInit<Server>, OnGatewayConnection<SocketMony> {
  private readonly log = new Logger(ListasGateway.name);

  constructor(
    private readonly tokens: TokensAcesso,
    private readonly compartilhamentos: CompartilhamentosService,
    private readonly avisos: AvisosTempoReal,
  ) {}

  afterInit(servidor: Server): void {
    this.avisos.ligar(servidor);
    servidor.use((socket, proximo) => {
      const { token } = socket.handshake.auth as { token?: unknown };
      if (typeof token !== 'string' || token === '') {
        proximo(erroConexao('NAO_AUTENTICADO'));
        return;
      }
      this.tokens.verificar(token).then(
        (usuario) => {
          // Só o token do app: o do painel e o de segundo plano (T-088b) não abrem o tempo real.
          if (usuario.escopo !== undefined) {
            proximo(erroConexao('ACESSO_NEGADO'));
            return;
          }
          (socket.data as DadosSocket).usuario = usuario;
          proximo();
        },
        (erro: unknown) => {
          proximo(erroConexao(erro instanceof ErroDominio ? erro.codigo : 'NAO_AUTENTICADO'));
        },
      );
    });
  }

  async handleConnection(socket: SocketMony): Promise<void> {
    await socket.join(salaDoUsuario(socket.data.usuario.id));
  }

  @SubscribeMessage(EVENTOS_TEMPO_REAL.entrarLista)
  async entrar(
    @ConnectedSocket() socket: SocketMony,
    @MessageBody() corpo: unknown,
  ): Promise<RespostaSalaLista> {
    const dados = esquemaSalaLista.safeParse(corpo);
    if (!dados.success) return { ok: false, codigo: 'REQUISICAO_INVALIDA' };
    try {
      await this.compartilhamentos.verificarAcesso(
        socket.data.usuario.id,
        'lista',
        dados.data.listaId,
        'ver',
      );
    } catch (erro) {
      if (erro instanceof ErroDominio) return { ok: false, codigo: erro.codigo };
      this.log.error(erro);
      reportarErro(erro, { origem: 'listas-tempo-real' });
      return { ok: false, codigo: 'ERRO_INTERNO' };
    }
    await socket.join(salaDaLista(dados.data.listaId));
    return { ok: true };
  }

  @SubscribeMessage(EVENTOS_TEMPO_REAL.sairLista)
  async sair(
    @ConnectedSocket() socket: SocketMony,
    @MessageBody() corpo: unknown,
  ): Promise<RespostaSalaLista> {
    const dados = esquemaSalaLista.safeParse(corpo);
    if (!dados.success) return { ok: false, codigo: 'REQUISICAO_INVALIDA' };
    await socket.leave(salaDaLista(dados.data.listaId));
    return { ok: true };
  }
}

/** O cliente recebe o código no `connect_error` (`erro.message`), para renovar o token se expirou. */
function erroConexao(codigo: string): Error {
  return Object.assign(new Error(codigo), { data: { codigo } });
}
