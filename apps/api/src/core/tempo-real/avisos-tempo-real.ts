import { Global, Injectable, Module } from '@nestjs/common';
import {
  EVENTOS_TEMPO_REAL,
  type ListaMudou,
  type MotivoMudancaLista,
  salaDaLista,
  salaDoUsuario,
} from '@mony/shared/tempo-real';
import type { Server } from 'socket.io';

/**
 * Avisos de tempo real (T-124b) para os serviços: avisam depois de gravar, e o app busca de novo.
 * O servidor Socket.IO é ligado pelo gateway quando a API HTTP sobe; no worker não há servidor e os
 * avisos não fazem nada. Com o adaptador Redis, o aviso chega aos sockets de todas as instâncias.
 */
@Injectable()
export class AvisosTempoReal {
  private servidor: Server | null = null;

  ligar(servidor: Server): void {
    this.servidor = servidor;
  }

  listaMudou(listaId: string, motivo: MotivoMudancaLista): void {
    this.servidor
      ?.to(salaDaLista(listaId))
      .emit(EVENTOS_TEMPO_REAL.listaMudou, { listaId, motivo } satisfies ListaMudou);
  }

  /** A pessoa perdeu o acesso: os aparelhos dela saem da sala e recebem o aviso para fechar a tela. */
  tirarDaLista(usuarioId: string, listaId: string): void {
    if (!this.servidor) return;
    this.servidor.in(salaDoUsuario(usuarioId)).socketsLeave(salaDaLista(listaId));
    this.servidor
      .to(salaDoUsuario(usuarioId))
      .emit(EVENTOS_TEMPO_REAL.listaMudou, { listaId, motivo: 'acesso' } satisfies ListaMudou);
  }

  /** A lista foi excluída: avisa quem está nela e esvazia a sala. */
  fecharLista(listaId: string): void {
    if (!this.servidor) return;
    this.listaMudou(listaId, 'excluida');
    this.servidor.in(salaDaLista(listaId)).socketsLeave(salaDaLista(listaId));
  }
}

@Global()
@Module({ providers: [AvisosTempoReal], exports: [AvisosTempoReal] })
export class TempoRealModule {}
