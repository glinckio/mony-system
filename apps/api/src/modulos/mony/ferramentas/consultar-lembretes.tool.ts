import { Injectable } from '@nestjs/common';
import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import { z } from 'zod';

import { usuarioDoContexto } from '../../../core/contexto/contexto';
import { LembretesService } from '../../lembretes/lembretes.service';
import { UsuariosService } from '../../usuarios/usuarios.service';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

/** Lembretes que voltam ao modelo: os mais próximos. */
const MAXIMO = 20;

const esquema = z.object({});

/**
 * `consultar_lembretes` (doc 08): os lembretes ativos, o que já tocou e espera o [Feito] primeiro,
 * depois o mais próximo, com a data e a hora no fuso do usuário (RN-075).
 */
@Injectable()
export class ConsultarLembretesTool implements Ferramenta<typeof esquema> {
  readonly nome = 'consultar_lembretes';
  readonly descricao =
    'Lembretes ativos: título, data e hora da próxima vez que toca (no fuso do usuário), repetição (RRULE), canais, se já tocou e espera o "feito" e até quando está adiado. Os compartilhados por outra pessoa vêm com o nome dela.';
  readonly esquema = esquema;

  constructor(
    private readonly lembretes: LembretesService,
    private readonly usuarios: UsuariosService,
  ) {}

  async executar(contexto: ContextoFerramenta): Promise<SaidaFerramenta> {
    const [{ fusoHorario: fuso }, { itens }] = await Promise.all([
      this.usuarios.perfil(usuarioDoContexto(contexto)),
      this.lembretes.listar(contexto, { status: 'ativo' }),
    ]);
    const local = (instante: string) => {
      const data = new Date(instante);
      return { data: dataNoFuso(data, fuso), hora: horaNoFuso(data, fuso) };
    };
    return {
      dados: {
        total: itens.length,
        lembretes: itens.slice(0, MAXIMO).map((lembrete) => ({
          titulo: lembrete.titulo,
          ...local(lembrete.dataHora),
          repeticao: lembrete.recorrencia,
          canais: lembrete.canais,
          jaTocou: lembrete.pendente,
          compartilhadoPor: lembrete.dono?.nome ?? null,
          adiadoAte: lembrete.adiadoAte === null ? null : local(lembrete.adiadoAte),
        })),
      },
    };
  }
}
