import { Injectable, Logger } from '@nestjs/common';
import {
  competenciaDe,
  competenciaNoFuso,
  type Competencia,
  type DataCalendario,
  dataNoFuso,
  FUSO_PADRAO,
  ultimoDiaDaCompetencia,
} from '@mony/shared/datas';
import { somarCompetencias } from '@mony/shared/cartoes';
import {
  type DadosDefinicaoOrcamento,
  faixaDoOrcamento,
  type ListaOrcamentos,
  type Orcamento,
  percentualDoOrcamento,
  projecaoDoMes,
} from '@mony/shared/orcamentos';
import type { Impacto } from '@mony/shared/transacoes';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { Rotina } from '../../core/rotinas/rotinas';
import {
  type GastoDaCategoria,
  type OrcamentoDoUsuario,
  OrcamentosRepository,
} from './orcamentos.repository';

/**
 * Orçamentos mensais por categoria de despesa (RN-060 a RN-062). O gasto é calculado na leitura,
 * a partir das despesas, e não guardado.
 */
@Injectable()
export class OrcamentosService {
  private readonly log = new Logger(OrcamentosService.name);

  constructor(
    private readonly repositorio: OrcamentosRepository,
    private readonly clock: Clock,
  ) {}

  /** RN-061: os orçamentos da competência (sem ela, o mês de hoje) com gasto e projeção. */
  async listar(contexto: Contexto, competencia?: Competencia): Promise<ListaOrcamentos> {
    const usuarioId = usuarioDoContexto(contexto);
    const hoje = await this.hoje(usuarioId);
    const mes = competencia ?? competenciaDe(hoje);
    const orcamentos = await this.repositorio.listar(usuarioId, mes);
    const itens = await this.comGasto(usuarioId, mes, orcamentos, hoje);
    const somar = (campo: 'valorLimiteCentavos' | 'gastoCentavos') =>
      itens.reduce((total, item) => total + item[campo], 0);
    return {
      competencia: mes,
      itens,
      totais: {
        valorLimiteCentavos: somar('valorLimiteCentavos'),
        gastoCentavos: somar('gastoCentavos'),
        restanteCentavos: somar('valorLimiteCentavos') - somar('gastoCentavos'),
      },
    };
  }

  /** RN-060: cria ou muda o orçamento da categoria na competência (sem ela, a do mês de hoje). */
  async definir(contexto: Contexto, dados: DadosDefinicaoOrcamento): Promise<Orcamento> {
    const usuarioId = usuarioDoContexto(contexto);
    const categoria = await this.repositorio.categoria(usuarioId, dados.categoriaId);
    if (!categoria) {
      throw new ErroDominio('NAO_ENCONTRADO', { detalhes: { categoriaId: dados.categoriaId } });
    }
    if (categoria.tipo !== 'despesa') {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Orçamento é para categoria de despesa.',
        detalhes: { categoriaId: dados.categoriaId },
      });
    }
    const hoje = await this.hoje(usuarioId);
    const competencia = dados.competencia ?? competenciaDe(hoje);
    const orcamento = await this.repositorio.definir({
      usuarioId,
      categoriaId: dados.categoriaId,
      competencia,
      valorLimite: BigInt(dados.valorLimiteCentavos),
      repetirMensal: dados.repetirMensal,
    });
    const [resposta] = await this.comGasto(usuarioId, competencia, [orcamento], hoje);
    if (!resposta) throw new ErroDominio('NAO_ENCONTRADO');
    return resposta;
  }

  /** Tira o orçamento da competência; os meses seguintes deixam de recebê-lo. */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    if (!(await this.repositorio.buscar(usuarioId, id))) throw new ErroDominio('NAO_ENCONTRADO');
    await this.repositorio.excluir(usuarioId, id);
  }

  /**
   * Quanto do orçamento da categoria, no mês da `data`, já foi usado ("Mercado: 81% do
   * orçamento", doc 05). Sem orçamento naquele mês, `null`.
   */
  async impacto(
    usuarioId: string,
    categoriaId: string,
    data: DataCalendario,
  ): Promise<NonNullable<Impacto['orcamento']> | null> {
    const competencia = competenciaDe(data);
    const orcamento = await this.repositorio.buscarDaCategoria(usuarioId, categoriaId, competencia);
    if (!orcamento) return null;
    const hoje = await this.hoje(usuarioId);
    const [resposta] = await this.comGasto(usuarioId, competencia, [orcamento], hoje);
    return resposta ? { categoriaId, percentualUsado: resposta.percentualUsado } : null;
  }

  /**
   * Rotina (doc 09, RN-060): no dia 1, às 00:15 de São Paulo, copia para o mês novo os
   * orçamentos do mês anterior marcados para repetir. Rodar de novo não duplica.
   */
  @Rotina({ nome: 'repetir-orcamentos', padrao: '15 0 1 * *' })
  async repetir(agora: Date): Promise<number> {
    const competencia = competenciaNoFuso(agora, FUSO_PADRAO);
    const copiados = await this.repositorio.copiarRepetidos(
      somarCompetencias(competencia, -1),
      competencia,
    );
    this.log.log(`Orçamentos repetidos em ${competencia}: ${String(copiados)}`);
    return copiados;
  }

  private async comGasto(
    usuarioId: string,
    competencia: Competencia,
    orcamentos: readonly OrcamentoDoUsuario[],
    hoje: DataCalendario,
  ): Promise<Orcamento[]> {
    const gastos = await this.repositorio.gastos(
      usuarioId,
      orcamentos.map(({ categoriaId }) => categoriaId),
      competencia,
      ultimoDiaDaCompetencia(competencia),
      hoje,
    );
    return orcamentos.map((orcamento) =>
      paraOrcamento(
        orcamento,
        gastos.get(orcamento.categoriaId) ?? { ateHoje: 0, depoisDeHoje: 0 },
        competencia,
        hoje,
      ),
    );
  }

  private async hoje(usuarioId: string): Promise<DataCalendario> {
    return dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
  }
}

function paraOrcamento(
  orcamento: OrcamentoDoUsuario,
  gasto: GastoDaCategoria,
  competencia: Competencia,
  hoje: DataCalendario,
): Orcamento {
  const limite = Number(orcamento.valorLimite);
  const gastoCentavos = gasto.ateHoje + gasto.depoisDeHoje;
  const percentualUsado = percentualDoOrcamento(gastoCentavos, limite);
  return {
    id: orcamento.id,
    categoriaId: orcamento.categoriaId,
    competencia,
    valorLimiteCentavos: limite,
    repetirMensal: orcamento.repetirMensal,
    gastoCentavos,
    restanteCentavos: limite - gastoCentavos,
    percentualUsado,
    faixa: faixaDoOrcamento(percentualUsado),
    projecaoCentavos: projecaoDoMes({
      competencia,
      hoje,
      gastoAteHojeCentavos: gasto.ateHoje,
      gastoDepoisDeHojeCentavos: gasto.depoisDeHoje,
    }),
  };
}
