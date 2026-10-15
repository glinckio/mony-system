import { renovarSessaoUmaVez } from '@mony/api-client';
import {
  CAMINHO_WS,
  esquemaListaMudou,
  EVENTOS_TEMPO_REAL,
  type ListaMudou,
} from '@mony/shared/tempo-real';
import { io, type Socket } from 'socket.io-client';

import { useSessao } from '@/stores/sessao';

import { configApp } from './config';

/** Erros da conexão que se resolvem com um token novo (o do middleware do gateway). */
const TOKEN_RECUSADO = new Set(['NAO_AUTENTICADO', 'TOKEN_EXPIRADO']);

type Ouvinte = (aviso: ListaMudou) => void;

let socket: Socket | null = null;
let renovando = false;
/** Lista aberta → quem ouve. Ao reconectar, o socket entra de novo em cada sala. */
const salas = new Map<string, Set<Ouvinte>>();

function entrar(conexao: Socket, listaId: string) {
  conexao.emit(EVENTOS_TEMPO_REAL.entrarLista, { listaId }, () => undefined);
}

function conectar(): Socket {
  if (socket) return socket;
  const conexao = io(configApp.urlApi, {
    path: CAMINHO_WS,
    transports: ['websocket'],
    // Função: a cada (re)conexão vai o token da hora, que a API renova sozinha.
    auth: (enviar) => {
      enviar({ token: useSessao.getState().tokenAcesso ?? '' });
    },
  });
  conexao.on('connect', () => {
    for (const listaId of salas.keys()) entrar(conexao, listaId);
  });
  conexao.on('connect_error', (erro: Error & { data?: { codigo?: string } }) => {
    // Recusa do middleware não reconecta sozinha: renova o token uma vez e tenta de novo.
    if (conexao.active || renovando || !TOKEN_RECUSADO.has(erro.data?.codigo ?? erro.message)) {
      return;
    }
    renovando = true;
    void renovarSessaoUmaVez()
      .then((renovou) => {
        if (renovou && salas.size > 0) conexao.connect();
      })
      .finally(() => {
        renovando = false;
      });
  });
  conexao.on(EVENTOS_TEMPO_REAL.listaMudou, (corpo: unknown) => {
    const aviso = esquemaListaMudou.safeParse(corpo);
    if (!aviso.success) return;
    for (const ouvinte of salas.get(aviso.data.listaId) ?? []) ouvinte(aviso.data);
  });
  socket = conexao;
  return conexao;
}

/**
 * Ouve as mudanças de uma lista compartilhada (RN-074, T-124b): conecta no Socket.IO da API na
 * primeira lista aberta e desconecta quando nenhuma tela ouve mais. Devolve a função que para.
 */
export function ouvirLista(listaId: string, ouvinte: Ouvinte): () => void {
  const conexao = conectar();
  let ouvintes = salas.get(listaId);
  if (!ouvintes) {
    ouvintes = new Set();
    salas.set(listaId, ouvintes);
    if (conexao.connected) entrar(conexao, listaId);
  }
  ouvintes.add(ouvinte);
  return () => {
    const atuais = salas.get(listaId);
    if (!atuais) return;
    atuais.delete(ouvinte);
    if (atuais.size > 0) return;
    salas.delete(listaId);
    if (conexao.connected) conexao.emit(EVENTOS_TEMPO_REAL.sairLista, { listaId }, () => undefined);
    if (salas.size === 0) {
      conexao.disconnect();
      socket = null;
    }
  };
}
