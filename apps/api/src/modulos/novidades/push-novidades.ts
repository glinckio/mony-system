import { Injectable, Logger } from '@nestjs/common';

import { Rotina } from '../../core/rotinas/rotinas';
import { MotorAlertas } from '../notificacoes/motor-alertas';
import { corpoDoPush } from './dominio/novidades';
import { NovidadesRepository } from './novidades.repository';

/** Pessoas por lote no envio de uma novidade. */
const LOTE_USUARIOS = 500;

/**
 * O push das novidades (T-141d, doc 09): a cada minuto, a novidade publicada com push que já entrou
 * no ar e ainda vale vai para todas as contas ativas, pelo motor de alertas (tipo `novidade`, chave
 * `novidade:<id>`: rodar de novo não repete, RN-102). Ao terminar, grava `push_enviado_em`.
 */
@Injectable()
export class PushNovidades {
  private readonly log = new Logger(PushNovidades.name);

  constructor(
    private readonly repositorio: NovidadesRepository,
    private readonly motor: MotorAlertas,
  ) {}

  @Rotina({ nome: 'enviar-push-novidades', padrao: '* * * * *' })
  async enviar(agora: Date): Promise<{ novidades: number; enviadas: number }> {
    const pendentes = await this.repositorio.pendentesDePush(agora);
    let enviadas = 0;
    for (const novidade of pendentes) {
      enviadas += await this.enviarUma(novidade, agora);
      await this.repositorio.marcarPushEnviado(novidade.id, agora);
      this.log.log(`Push da novidade ${novidade.id} enviado`);
    }
    return { novidades: pendentes.length, enviadas };
  }

  private async enviarUma(
    novidade: { id: string; titulo: string; descricao: string },
    agora: Date,
  ): Promise<number> {
    let enviadas = 0;
    let cursor: string | undefined;
    for (;;) {
      const usuarios = await this.repositorio.usuariosAtivos(cursor, LOTE_USUARIOS);
      if (usuarios.length === 0) return enviadas;
      const resultado = await this.motor.emitir(
        usuarios.map((usuarioId) => ({
          usuarioId,
          tipo: 'novidade',
          chaveUnica: `novidade:${novidade.id}`,
          urgente: false,
          titulo: novidade.titulo,
          corpo: corpoDoPush(novidade.descricao),
          linkInterno: 'mony://notificacoes',
          vaiParaChat: false,
        })),
        agora,
      );
      enviadas += resultado.enviadas.length + resultado.adiadas.length;
      cursor = usuarios.at(-1);
    }
  }
}
