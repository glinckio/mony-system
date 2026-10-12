import { Injectable } from '@nestjs/common';
import { competenciaDe, dataNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';
import { z } from 'zod';

import { Clock } from '../../../core/clock/clock';
import { usuarioDoContexto } from '../../../core/contexto/contexto';
import { ErroDominio } from '../../../core/erros/erro-dominio';
import { RelatoriosService } from '../../relatorios/relatorios.service';
import { TransacoesService } from '../../transacoes/transacoes.service';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  de: campos.data
    .optional()
    .describe('Início, AAAA-MM-DD (incluso). Sem ele, o dia 1 do mês de hoje.'),
  ate: campos.data.optional().describe('Fim, AAAA-MM-DD (incluso). Sem ele, hoje.'),
});

/** Quantas categorias de despesa vão no resumo. */
const CATEGORIAS_NO_RESUMO = 5;
const DIA_MS = 24 * 60 * 60 * 1000;

const dias = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS) + 1;

/**
 * `resumo_periodo` (doc 08): receitas, despesas e saldo do período (RN-047), as categorias com mais
 * despesa e a comparação com o período anterior do mesmo tamanho.
 */
@Injectable()
export class ResumoPeriodoTool implements Ferramenta<typeof esquema> {
  readonly nome = 'resumo_periodo';
  readonly descricao =
    'Resumo de um período: receitas, despesas e saldo (centavos), as 5 categorias com mais despesa e as mesmas contas do período anterior, do mesmo tamanho, para comparar. Use para "quanto gastei", "como estou no mês" e afins.';
  readonly esquema = esquema;

  constructor(
    private readonly transacoes: TransacoesService,
    private readonly relatorios: RelatoriosService,
    private readonly usuarios: UsuariosService,
    private readonly clock: Clock,
  ) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    const perfil = await this.usuarios.perfil(usuarioDoContexto(contexto));
    const hoje = dataNoFuso(this.clock.agora(), perfil.fusoHorario);
    const ate = entrada.ate ?? hoje;
    const de = entrada.de ?? competenciaDe(hoje);
    if (de > ate) {
      throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'O início vem depois do fim.' });
    }
    const anteriorAte = somarDias(de, -1);
    const anteriorDe = somarDias(anteriorAte, -(dias(de, ate) - 1));
    const [totais, anterior, categorias] = await Promise.all([
      this.transacoes.totais(contexto, { de, ate }),
      this.transacoes.totais(contexto, { de: anteriorDe, ate: anteriorAte }),
      this.relatorios.categorias(contexto, { inicio: de, fim: ate, tipo: 'despesa' }),
    ]);
    return {
      dados: {
        periodo: { de, ate },
        receitasCentavos: totais.receitasCentavos,
        despesasCentavos: totais.despesasCentavos,
        saldoCentavos: totais.saldoCentavos,
        categorias: categorias.itens
          .slice(0, CATEGORIAS_NO_RESUMO)
          .map(({ nome, totalCentavos, percentual }) => ({ nome, totalCentavos, percentual })),
        anterior: {
          periodo: { de: anteriorDe, ate: anteriorAte },
          receitasCentavos: anterior.receitasCentavos,
          despesasCentavos: anterior.despesasCentavos,
          saldoCentavos: anterior.saldoCentavos,
        },
      },
    };
  }
}
