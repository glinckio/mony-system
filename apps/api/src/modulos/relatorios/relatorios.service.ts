import { Injectable } from '@nestjs/common';
import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import {
  competenciasEntre,
  type ConsultaRelatorio,
  type ConsultaRelatorioCategorias,
  periodoPadraoRelatorio,
  type RelatorioAnual,
  type RelatorioCartoes,
  type RelatorioCategorias,
  type RelatorioDiasDaSemana,
  type RelatorioFormasPagamento,
  type RelatorioMensal,
} from '@mony/shared/relatorios';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { RelatoriosRepository } from './relatorios.repository';

interface Periodo {
  usuarioId: string;
  inicio: DataCalendario;
  fim: DataCalendario;
}

/**
 * Relatórios do RN-150, sem exportação (a exportação PDF/XLSX, RN-151, é outra tarefa). O
 * histórico de preços da NFC-e entra com a leitura de NFC-e (T-066).
 */
@Injectable()
export class RelatoriosService {
  constructor(
    private readonly repositorio: RelatoriosRepository,
    private readonly clock: Clock,
  ) {}

  /** Receitas × despesas por mês, todos os meses do período, com o saldo acumulado. */
  async mensal(contexto: Contexto, consulta: ConsultaRelatorio): Promise<RelatorioMensal> {
    const { usuarioId, inicio, fim } = await this.periodo(contexto, consulta);
    const somas = await this.repositorio.porMes(usuarioId, inicio, fim);
    let acumulado = 0;
    const itens = competenciasEntre(inicio, fim).map((competencia) => {
      const total = (tipo: string) =>
        somas.find((linha) => linha.competencia === competencia && linha.tipo === tipo)?.total ?? 0;
      const receitasCentavos = total('receita');
      const despesasCentavos = total('despesa');
      acumulado += receitasCentavos - despesasCentavos;
      return {
        competencia,
        receitasCentavos,
        despesasCentavos,
        saldoCentavos: receitasCentavos - despesasCentavos,
        saldoAcumuladoCentavos: acumulado,
      };
    });
    const somar = (campo: 'receitasCentavos' | 'despesasCentavos') =>
      itens.reduce((soma, item) => soma + item[campo], 0);
    return {
      inicio,
      fim,
      itens,
      totais: {
        receitasCentavos: somar('receitasCentavos'),
        despesasCentavos: somar('despesasCentavos'),
        saldoCentavos: somar('receitasCentavos') - somar('despesasCentavos'),
      },
    };
  }

  /** Evolução anual: receitas × despesas por ano, todos os anos do período. */
  async anual(contexto: Contexto, consulta: ConsultaRelatorio): Promise<RelatorioAnual> {
    const { usuarioId, inicio, fim } = await this.periodo(contexto, consulta);
    const somas = await this.repositorio.porAno(usuarioId, inicio, fim);
    const itens: RelatorioAnual['itens'] = [];
    for (let ano = Number(inicio.slice(0, 4)); ano <= Number(fim.slice(0, 4)); ano += 1) {
      const total = (tipo: string) =>
        somas.find((linha) => linha.ano === ano && linha.tipo === tipo)?.total ?? 0;
      itens.push({
        ano,
        receitasCentavos: total('receita'),
        despesasCentavos: total('despesa'),
        saldoCentavos: total('receita') - total('despesa'),
      });
    }
    return { inicio, fim, itens };
  }

  async categorias(
    contexto: Contexto,
    consulta: ConsultaRelatorioCategorias,
  ): Promise<RelatorioCategorias> {
    const { usuarioId, inicio, fim } = await this.periodo(contexto, consulta);
    const grupos = await this.repositorio.porCategoria(usuarioId, consulta.tipo, inicio, fim);
    const categorias = new Map(
      (
        await this.repositorio.categorias(
          usuarioId,
          grupos.map(({ categoriaId }) => categoriaId),
        )
      ).map((categoria) => [categoria.id, categoria]),
    );
    const totalCentavos = grupos.reduce((soma, grupo) => soma + Number(grupo._sum.valor ?? 0n), 0);
    const itens = grupos
      .map((grupo) => {
        const categoria = categorias.get(grupo.categoriaId);
        const total = Number(grupo._sum.valor ?? 0n);
        return {
          categoriaId: grupo.categoriaId,
          nome: categoria?.nome ?? '',
          cor: categoria?.cor ?? '',
          icone: categoria?.icone ?? '',
          totalCentavos: total,
          percentual: totalCentavos > 0 ? Math.floor((total * 100) / totalCentavos) : 0,
          quantidade: grupo._count._all,
        };
      })
      .sort((a, b) => b.totalCentavos - a.totalCentavos || a.nome.localeCompare(b.nome));
    return { inicio, fim, tipo: consulta.tipo, totalCentavos, itens };
  }

  async diasDaSemana(
    contexto: Contexto,
    consulta: ConsultaRelatorio,
  ): Promise<RelatorioDiasDaSemana> {
    const { usuarioId, inicio, fim } = await this.periodo(contexto, consulta);
    const linhas = await this.repositorio.despesasPorDiaDaSemana(usuarioId, inicio, fim);
    return {
      inicio,
      fim,
      itens: Array.from({ length: 7 }, (_, diaDaSemana) => {
        const linha = linhas.find(({ dia }) => dia === diaDaSemana);
        return {
          diaDaSemana,
          totalCentavos: linha?.total ?? 0,
          quantidade: linha?.quantidade ?? 0,
        };
      }),
    };
  }

  async cartoes(contexto: Contexto, consulta: ConsultaRelatorio): Promise<RelatorioCartoes> {
    const { usuarioId, inicio, fim } = await this.periodo(contexto, consulta);
    const grupos = (await this.repositorio.porCartao(usuarioId, inicio, fim)).flatMap((grupo) =>
      grupo.cartaoId === null ? [] : [{ ...grupo, cartaoId: grupo.cartaoId }],
    );
    const cartoes = new Map(
      (
        await this.repositorio.cartoes(
          usuarioId,
          grupos.map(({ cartaoId }) => cartaoId),
        )
      ).map((cartao) => [cartao.id, cartao]),
    );
    const itens = grupos
      .map((grupo) => ({
        cartaoId: grupo.cartaoId,
        nome: cartoes.get(grupo.cartaoId)?.nome ?? '',
        cor: cartoes.get(grupo.cartaoId)?.cor ?? '',
        totalCentavos: Number(grupo._sum.valor ?? 0n),
        quantidade: grupo._count._all,
      }))
      .sort((a, b) => b.totalCentavos - a.totalCentavos || a.nome.localeCompare(b.nome));
    return { inicio, fim, itens };
  }

  async formasPagamento(
    contexto: Contexto,
    consulta: ConsultaRelatorio,
  ): Promise<RelatorioFormasPagamento> {
    const { usuarioId, inicio, fim } = await this.periodo(contexto, consulta);
    const itens = (await this.repositorio.porFormaPagamento(usuarioId, inicio, fim))
      .flatMap((grupo) =>
        grupo.formaPagamento === null
          ? []
          : [
              {
                formaPagamento: grupo.formaPagamento,
                totalCentavos: Number(grupo._sum.valor ?? 0n),
                quantidade: grupo._count._all,
              },
            ],
      )
      .sort((a, b) => b.totalCentavos - a.totalCentavos);
    return { inicio, fim, itens };
  }

  /** O período pedido ou, sem ele, os últimos 12 meses no dia de hoje do usuário. */
  private async periodo(contexto: Contexto, consulta: ConsultaRelatorio): Promise<Periodo> {
    const usuarioId = usuarioDoContexto(contexto);
    if (consulta.inicio !== undefined && consulta.fim !== undefined) {
      return { usuarioId, inicio: consulta.inicio, fim: consulta.fim };
    }
    const hoje = dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
    return { usuarioId, ...periodoPadraoRelatorio(hoje) };
  }
}
