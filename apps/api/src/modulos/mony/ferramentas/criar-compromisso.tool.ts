import { Injectable } from '@nestjs/common';
import {
  TAMANHO_MAXIMO_LOCAL_COMPROMISSO,
  TAMANHO_MAXIMO_TITULO_COMPROMISSO,
} from '@mony/shared/agenda';
import { dataNoFuso, horaNoFuso, instanteNoFuso } from '@mony/shared/datas';
import { REGEX_HORA } from '@mony/shared/notificacoes';
import { z } from 'zod';

import { usuarioDoContexto } from '../../../core/contexto/contexto';
import { AgendaService } from '../../agenda/agenda.service';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

/** Até um dia inteiro. */
const DURACAO_MAXIMA_MINUTOS = 24 * 60;

const esquema = z.object({
  titulo: z
    .string()
    .trim()
    .min(1)
    .max(TAMANHO_MAXIMO_TITULO_COMPROMISSO)
    .describe('O compromisso, curto: "Dentista", "Reunião com a Bia".'),
  data: campos.data.describe('Dia do compromisso, AAAA-MM-DD, a partir de "Hoje" no contexto.'),
  hora: z
    .string()
    .regex(REGEX_HORA, 'Hora no formato HH:MM')
    .describe('Hora do começo, HH:MM (24 h), a partir de "Agora" no contexto.'),
  duracaoMinutos: z
    .number()
    .int()
    .min(5)
    .max(DURACAO_MAXIMA_MINUTOS)
    .optional()
    .describe('Quanto dura, em minutos, só se a pessoa disser ("das 14h às 15h" é 60).'),
  local: z
    .string()
    .trim()
    .min(1)
    .max(TAMANHO_MAXIMO_LOCAL_COMPROMISSO)
    .optional()
    .describe('Onde, só se a pessoa disser.'),
});

/**
 * `criar_compromisso` (doc 08, T-086b): cria pelo `AgendaService` com origem `mony`, na agenda
 * padrão (RN-079); sem agenda conectada, fica só no Mony. A data e a hora vêm no fuso do usuário.
 */
@Injectable()
export class CriarCompromissoTool implements Ferramenta<typeof esquema> {
  readonly nome = 'criar_compromisso';
  readonly descricao =
    'Marca um compromisso na agenda (consulta, reunião, evento com dia e hora). Use para o que a pessoa vai fazer num horário; para ser avisada de algo, use criar_lembrete.';
  readonly esquema = esquema;

  constructor(
    private readonly agenda: AgendaService,
    private readonly usuarios: UsuariosService,
  ) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const { fusoHorario: fuso } = await this.usuarios.perfil(usuarioDoContexto(contexto));
    const inicio = instanteNoFuso(entrada.data, entrada.hora, fuso);
    const fim =
      entrada.duracaoMinutos === undefined
        ? null
        : new Date(inicio.getTime() + entrada.duracaoMinutos * 60_000);
    const compromisso = await this.agenda.criarCompromisso(contexto, {
      titulo: entrada.titulo,
      inicio: inicio.toISOString(),
      fim: fim?.toISOString() ?? null,
      local: entrada.local ?? null,
    });
    return {
      dados: {
        criado: true,
        titulo: compromisso.titulo,
        data: dataNoFuso(inicio, fuso),
        hora: horaNoFuso(inicio, fuso),
        horaFim: fim === null ? null : horaNoFuso(fim, fuso),
        local: compromisso.local,
        // Em qual agenda conectada entrou; `null` quando ficou só no Mony.
        agenda: compromisso.agenda?.provedor ?? null,
      },
    };
  }
}
