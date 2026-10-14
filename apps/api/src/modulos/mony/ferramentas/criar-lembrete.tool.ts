import { Injectable } from '@nestjs/common';
import { LINKS_INTERNOS } from '@mony/shared/alertas';
import { dataNoFuso, horaNoFuso, instanteNoFuso } from '@mony/shared/datas';
import {
  escreverRegra,
  FREQUENCIAS_LEMBRETE,
  INTERVALO_MAXIMO_LEMBRETE,
  TAMANHO_MAXIMO_TITULO_LEMBRETE,
} from '@mony/shared/lembretes';
import { REGEX_HORA } from '@mony/shared/notificacoes';
import { z } from 'zod';

import { usuarioDoContexto } from '../../../core/contexto/contexto';
import { LembretesService } from '../../lembretes/lembretes.service';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

/** Os dias como o modelo escreve; o índice é o dia da semana (0 = domingo). */
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;

const esquema = z.object({
  titulo: z
    .string()
    .trim()
    .min(1)
    .max(TAMANHO_MAXIMO_TITULO_LEMBRETE)
    .describe('O que lembrar, curto e com verbo: "Pagar o IPVA".'),
  data: campos.data.describe(
    'Data do aviso (o primeiro, se repete), AAAA-MM-DD, a partir de "Hoje" no contexto.',
  ),
  hora: z
    .string()
    .regex(REGEX_HORA, 'Hora no formato HH:MM')
    .describe(
      'Hora do aviso, HH:MM (24 h), a partir de "Agora" no contexto. Sem hora dita, 09:00.',
    ),
  repeticao: z
    .object({
      frequencia: z.enum(FREQUENCIAS_LEMBRETE),
      intervalo: z
        .number()
        .int()
        .min(1)
        .max(INTERVALO_MAXIMO_LEMBRETE)
        .optional()
        .describe('A cada quantos: 2 com semanal é a cada 2 semanas. Sem ele, 1.'),
      dias: z
        .array(z.enum(DIAS))
        .min(1)
        .optional()
        .describe('Semanal: os dias. Sem eles, o dia da semana da data.'),
      ate: campos.data
        .optional()
        .describe('Último dia em que repete, AAAA-MM-DD. Sem ele, não acaba.'),
    })
    .optional()
    .describe(
      'Só se a pessoa pedir para repetir ("todo dia", "toda segunda"). Sem ela, avisa uma vez.',
    ),
  alarme: z
    .boolean()
    .optional()
    .describe('Também toca como alarme no celular, se a pessoa pedir alarme ou para acordar.'),
});

/**
 * `criar_lembrete` (doc 08): cria o lembrete pelo `LembretesService` (RN-075), com a data e a hora
 * no fuso do usuário. A notificação sempre vai; o alarme, quando pedido. No gratuito, o limite de
 * lembretes ativos volta com o [Ver planos] (RN-120, RN-123).
 */
@Injectable()
export class CriarLembreteTool implements Ferramenta<typeof esquema> {
  readonly nome = 'criar_lembrete';
  readonly descricao =
    'Cria um lembrete com data e hora (e repetição, se pedida). Use quando a pessoa pedir para ser lembrada de algo; depois diga quando vai tocar.';
  readonly esquema = esquema;

  constructor(
    private readonly lembretes: LembretesService,
    private readonly usuarios: UsuariosService,
  ) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const { fusoHorario: fuso } = await this.usuarios.perfil(usuarioDoContexto(contexto));
    const repeticao = entrada.repeticao;
    const recorrencia =
      repeticao === undefined
        ? null
        : escreverRegra({
            frequencia: repeticao.frequencia,
            intervalo: repeticao.intervalo ?? 1,
            diasDaSemana:
              repeticao.frequencia === 'semanal' && repeticao.dias
                ? [...new Set(repeticao.dias.map((dia) => DIAS.indexOf(dia)))].sort((a, b) => a - b)
                : [],
            diaDoMes: null,
            mes: null,
            ate: repeticao.ate ?? null,
          });
    const lembrete = await this.lembretes.criar(contexto, {
      titulo: entrada.titulo,
      dataHora: instanteNoFuso(entrada.data, entrada.hora, fuso).toISOString(),
      recorrencia,
      canais: entrada.alarme === true ? ['push', 'alarme'] : ['push'],
    });
    const quando = new Date(lembrete.dataHora);
    return {
      dados: {
        criado: true,
        titulo: lembrete.titulo,
        // A primeira vez que toca (com repetição, pode ser outro dia que o pedido).
        data: dataNoFuso(quando, fuso),
        hora: horaNoFuso(quando, fuso),
        repeticao: lembrete.recorrencia,
        canais: lembrete.canais,
      },
      componentes: [
        {
          tipo: 'botoes',
          opcoes: [
            {
              id: 'ver-lembrete',
              rotulo: 'Ver lembrete',
              acao: { tipo: 'abrir', link: LINKS_INTERNOS.lembrete(lembrete.id) },
            },
          ],
        },
      ],
    };
  }
}
