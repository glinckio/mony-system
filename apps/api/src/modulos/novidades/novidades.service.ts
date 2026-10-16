import { Injectable } from '@nestjs/common';
import { MAXIMO_NOVIDADES_APP, type Novidade, type Novidades } from '@mony/shared/notificacoes';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { type LinhaNovidade, NovidadesRepository } from './novidades.repository';

/**
 * Novidades no app (T-150, doc 13): as que estão no ar (publicadas, que já entraram e ainda
 * valem), na aba Novidades da central. As publicadas antes de a conta existir chegam lidas, para
 * quem acabou de se cadastrar não ver um contador cheio de comunicados antigos.
 */
@Injectable()
export class NovidadesService {
  constructor(
    private readonly repositorio: NovidadesRepository,
    private readonly clock: Clock,
  ) {}

  async listar(contexto: Contexto): Promise<Novidades> {
    const usuarioId = usuarioDoContexto(contexto);
    const agora = this.clock.agora();
    const criadaEm = await this.repositorio.criacaoDaConta(usuarioId);
    const [linhas, naoLidas] = await Promise.all([
      this.repositorio.noAr(usuarioId, agora, MAXIMO_NOVIDADES_APP),
      this.repositorio.contarNaoLidas(usuarioId, criadaEm, agora),
    ]);
    return { itens: linhas.map((linha) => paraNovidade(linha, criadaEm)), naoLidas };
  }

  /** O contador do sino, no Início. */
  async contarNaoLidas(usuarioId: string): Promise<number> {
    const criadaEm = await this.repositorio.criacaoDaConta(usuarioId);
    return this.repositorio.contarNaoLidas(usuarioId, criadaEm, this.clock.agora());
  }

  /** 404 se a novidade não está no ar. Marcar de novo não faz nada. */
  async marcarLida(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const agora = this.clock.agora();
    if (!(await this.repositorio.estaNoAr(id, agora))) throw new ErroDominio('NAO_ENCONTRADO');
    await this.repositorio.marcarLida(usuarioId, id, agora);
  }
}

function paraNovidade(linha: LinhaNovidade, criadaEm: Date): Novidade {
  return {
    id: linha.id,
    titulo: linha.titulo,
    descricao: linha.descricao,
    videoUrl: linha.videoUrl,
    publicadaEm: linha.publicadaEm.toISOString(),
    lida: linha.lida || linha.publicadaEm.getTime() <= criadaEm.getTime(),
  };
}
