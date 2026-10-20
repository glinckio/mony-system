import { Injectable } from '@nestjs/common';
import { dataNoFuso, horaNoFuso, instanteNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';
import { z } from 'zod';

import { usuarioDoContexto } from '../../../core/contexto/contexto';
import { ErroDominio } from '../../../core/erros/erro-dominio';
import { AgendaService } from '../../agenda/agenda.service';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

/** Compromissos que voltam ao modelo: os primeiros do período. */
const MAXIMO = 30;
/** Sem o fim, uma semana a partir do início. */
const DIAS_PADRAO = 7;
const DIAS_MAXIMO = 31;

const esquema = z.object({
  inicio: campos.data.describe('Primeiro dia, AAAA-MM-DD, a partir de "Hoje" no contexto.'),
  fim: campos.data
    .optional()
    .describe(
      'Último dia (inclusive), AAAA-MM-DD; "amanhã" é o mesmo dia do início. Sem ele, 7 dias.',
    ),
});

/**
 * `consultar_agenda` (doc 08, T-086b): os compromissos que cruzam o período (até 31 dias), com a
 * data e a hora no fuso do usuário. Os externos vêm marcados: a Mony não muda esses (RN-079).
 */
@Injectable()
export class ConsultarAgendaTool implements Ferramenta<typeof esquema> {
  readonly nome = 'consultar_agenda';
  readonly descricao =
    'Compromissos da agenda num período de dias: título, data, hora de começo e de fim (no fuso do usuário), local e de qual agenda vieram. Os da agenda do Google ou do Outlook são só leitura.';
  readonly esquema = esquema;

  constructor(
    private readonly agenda: AgendaService,
    private readonly usuarios: UsuariosService,
  ) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const ultimo = entrada.fim ?? somarDias(entrada.inicio, DIAS_PADRAO - 1);
    if (ultimo < entrada.inicio || somarDias(entrada.inicio, DIAS_MAXIMO - 1) < ultimo) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: `O período vai de 1 a ${String(DIAS_MAXIMO)} dias, com o fim depois do início.`,
        detalhes: { campo: 'fim' },
      });
    }
    const { fusoHorario: fuso } = await this.usuarios.perfil(usuarioDoContexto(contexto));
    const { itens } = await this.agenda.agendaDoPeriodo(contexto, {
      inicio: instanteNoFuso(entrada.inicio, '00:00', fuso).toISOString(),
      fim: instanteNoFuso(somarDias(ultimo, 1), '00:00', fuso).toISOString(),
    });
    return {
      dados: {
        de: entrada.inicio,
        ate: ultimo,
        total: itens.length,
        compromissos: itens.slice(0, MAXIMO).map((compromisso) => {
          const inicio = new Date(compromisso.inicio);
          const fim = compromisso.fim === null ? null : new Date(compromisso.fim);
          return {
            titulo: compromisso.titulo,
            data: dataNoFuso(inicio, fuso),
            hora: horaNoFuso(inicio, fuso),
            dataFim: fim === null ? null : dataNoFuso(fim, fuso),
            horaFim: fim === null ? null : horaNoFuso(fim, fuso),
            local: compromisso.local,
            agenda: compromisso.agenda?.provedor ?? 'mony',
            soLeitura: !compromisso.editavel,
          };
        }),
      },
    };
  }
}
