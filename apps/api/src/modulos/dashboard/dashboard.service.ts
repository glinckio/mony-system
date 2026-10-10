import { Injectable } from '@nestjs/common';
import {
  type ConsultaDashboard,
  type Dashboard,
  JANELA_VENCIMENTOS_DIAS,
  periodoDoDashboard,
  type Vencimento,
} from '@mony/shared/dashboard';
import { competenciaDe, type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { CartoesService } from '../cartoes/cartoes.service';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { DashboardRepository } from './dashboard.repository';

/** Limite de itens em "próximos vencimentos". */
const MAXIMO_VENCIMENTOS = 50;

/**
 * Início em uma chamada (RN-020 a RN-024, doc 04): resumo do período, próximos vencimentos,
 * cartões, orçamentos do mês e o checklist do onboarding.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly repositorio: DashboardRepository,
    private readonly cartoes: CartoesService,
    private readonly orcamentos: OrcamentosService,
    private readonly usuarios: UsuariosService,
    private readonly clock: Clock,
  ) {}

  async obter(contexto: Contexto, consulta: ConsultaDashboard): Promise<Dashboard> {
    const usuarioId = usuarioDoContexto(contexto);
    const hoje = dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
    const periodo = periodoDoDashboard(consulta.periodo, hoje, consulta);
    const [resumo, proximosVencimentos, cartoes, orcamentos, onboarding] = await Promise.all([
      this.resumo(usuarioId, periodo.de, periodo.ate),
      this.vencimentos(usuarioId, hoje),
      this.cartoes.listar(contexto),
      this.orcamentos.listar(contexto, competenciaDe(periodo.de)),
      this.usuarios.onboarding(usuarioId),
    ]);
    return {
      periodo: { tipo: consulta.periodo, ...periodo },
      resumo,
      proximosVencimentos,
      cartoes: cartoes.itens,
      orcamentos,
      onboarding,
    };
  }

  /**
   * RN-020: saldo = receitas pagas − despesas pagas. Despesas só de natureza `normal`: pagamento
   * de fatura e transferência ficam de fora (RN-037). Compra no cartão conta na data da compra,
   * pendente até a fatura ser paga.
   */
  private async resumo(
    usuarioId: string,
    de: DataCalendario,
    ate: DataCalendario,
  ): Promise<Dashboard['resumo']> {
    let receitas = 0n;
    let receitasPagas = 0n;
    let despesasPagas = 0n;
    let despesasPendentes = 0n;
    for (const grupo of await this.repositorio.somas(usuarioId, de, ate)) {
      const valor = grupo._sum.valor ?? 0n;
      if (grupo.tipo === 'receita') {
        receitas += valor;
        if (grupo.status === 'pago') receitasPagas += valor;
      } else if (grupo.natureza === 'normal') {
        if (grupo.status === 'pago') despesasPagas += valor;
        else despesasPendentes += valor;
      }
    }
    return {
      saldoCentavos: Number(receitasPagas - despesasPagas),
      receitasCentavos: Number(receitas),
      receitasPagasCentavos: Number(receitasPagas),
      despesasPagasCentavos: Number(despesasPagas),
      despesasPendentesCentavos: Number(despesasPendentes),
    };
  }

  /**
   * RN-023: faturas com saldo, parcelas de dívida e contas pendentes, dos atrasados de até 30
   * dias aos que vencem nos próximos 30, por data. Parcela de cartão já está na fatura.
   */
  private async vencimentos(usuarioId: string, hoje: DataCalendario): Promise<Vencimento[]> {
    const de = somarDias(hoje, -JANELA_VENCIMENTOS_DIAS);
    const ate = somarDias(hoje, JANELA_VENCIMENTOS_DIAS);
    const [faturas, parcelas, contas] = await Promise.all([
      this.repositorio.faturasNaJanela(usuarioId, de, ate),
      this.repositorio.parcelasNaJanela(usuarioId, de, ate),
      this.repositorio.contasNaJanela(usuarioId, de, ate),
    ]);
    const dia = (data: Date) => data.toISOString().slice(0, 10);
    const itens: Vencimento[] = [
      ...faturas
        .filter(({ valorTotal, valorPago }) => valorTotal > valorPago)
        .map((fatura) => ({
          tipo: 'fatura' as const,
          id: fatura.id,
          descricao: `Fatura ${fatura.cartao.nome}`,
          valorCentavos: Number(fatura.valorTotal - fatura.valorPago),
          vencimento: dia(fatura.dataVencimento),
          atrasado: dia(fatura.dataVencimento) < hoje,
          cartaoId: fatura.cartaoId,
          parcelamentoId: null,
          transacaoId: null,
        })),
      ...parcelas.map((parcela) => ({
        tipo: 'parcela' as const,
        id: parcela.id,
        descricao: `${parcela.parcelamento.nome} (${String(parcela.numero)}/${String(parcela.parcelamento.totalParcelas)})`,
        valorCentavos: Number(parcela.valor),
        vencimento: dia(parcela.vencimento),
        atrasado: dia(parcela.vencimento) < hoje,
        cartaoId: null,
        parcelamentoId: parcela.parcelamento.id,
        transacaoId: parcela.transacaoId,
      })),
      ...contas.map((conta) => ({
        tipo: 'conta' as const,
        id: conta.id,
        descricao: conta.descricao,
        valorCentavos: Number(conta.valor),
        vencimento: dia(conta.data),
        atrasado: dia(conta.data) < hoje,
        cartaoId: null,
        parcelamentoId: null,
        transacaoId: conta.id,
      })),
    ];
    return itens
      .sort(
        (a, b) =>
          a.vencimento.localeCompare(b.vencimento) ||
          a.tipo.localeCompare(b.tipo) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, MAXIMO_VENCIMENTOS);
  }
}
