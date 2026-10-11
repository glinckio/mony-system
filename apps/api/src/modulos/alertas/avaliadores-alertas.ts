import { Injectable, Logger } from '@nestjs/common';
import {
  ANTECEDENCIA_PADRAO_DIAS,
  foraDoPadrao,
  JANELA_GASTO_VARIAVEL_DIAS,
  LINKS_INTERNOS,
  marcoDoVencimento,
  mediaDaCategoria,
  PARAMETROS_FORA_DO_PADRAO,
  saldoProjetadoDoMes,
  semanaIso,
  diasRestantesNoMes,
} from '@mony/shared/alertas';
import { faixaAtingida, faturaDaCompra } from '@mony/shared/cartoes';
import { diasEntre } from '@mony/shared/dashboard';
import {
  competenciaDe,
  type DataCalendario,
  dataNoFuso,
  horaNoFuso,
  ultimoDiaDaCompetencia,
} from '@mony/shared/datas';
import { ALERTAS_ORCAMENTO } from '@mony/shared/orcamentos';
import { somarDias } from '@mony/shared/recorrencias';

import { Clock } from '../../core/clock/clock';
import { AoEvento } from '../../core/eventos/ao-evento.decorator';
import type { EventoDominio } from '../../core/eventos/evento-dominio';
import { Rotina } from '../../core/rotinas/rotinas';
import {
  CartoesService,
  EVENTO_FATURA_ATRASADA,
  EVENTO_FATURA_FECHADA,
} from '../cartoes/cartoes.service';
import { type AlertaCandidato, MotorAlertas } from '../notificacoes/motor-alertas';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { EVENTO_PARCELAMENTO_REGISTRADO } from '../parcelamentos/parcelamentos.service';
import {
  EVENTO_TRANSACAO_ALTERADA,
  EVENTO_TRANSACAO_REGISTRADA,
} from '../transacoes/transacoes.service';
import { AlertasRepository, deDataDoBanco } from './alertas.repository';
import {
  textoFaturaAtrasada,
  textoFaturaFechada,
  textoFaturaVencimento,
  textoForaDoPadrao,
  textoLimiteCartao,
  textoOrcamento,
  textoProjecaoDoMes,
  textoVencimentoPendente,
} from './textos';

/** Doc 09: os alertas de vencimento e projeção saem às 09:00 no fuso de cada usuário. */
export const HORA_ALERTAS_DIARIOS = '09';

/** Usuários por lote na rotina diária. */
const LOTE_USUARIOS = 200;

/**
 * Avaliadores dos alertas de dinheiro (T-082, doc 09): cartão, fatura, orçamento, vencimentos,
 * gasto fora do padrão e projeção do mês. Os de evento rodam no worker, quando o evento sai da
 * fila; os de vencimento e projeção, na rotina diária. Todos só propõem: quem filtra, grava e
 * envia é o `MotorAlertas`, e a chave única segura a repetição (RN-102) quando o evento ou a
 * rotina rodam de novo.
 */
@Injectable()
export class AvaliadoresAlertas {
  private readonly log = new Logger(AvaliadoresAlertas.name);

  constructor(
    private readonly repositorio: AlertasRepository,
    private readonly motor: MotorAlertas,
    private readonly cartoes: CartoesService,
    private readonly orcamentos: OrcamentosService,
    private readonly clock: Clock,
  ) {}

  /**
   * Despesa lançada ou alterada: limite do cartão (RN-038), orçamento (RN-062) e fora do padrão
   * (RN-106).
   */
  @AoEvento(EVENTO_TRANSACAO_REGISTRADA)
  async aoRegistrarTransacao(evento: EventoDominio<{ transacaoId: string }>): Promise<void> {
    await this.avaliarTransacao(evento.dados.transacaoId);
  }

  @AoEvento(EVENTO_TRANSACAO_ALTERADA)
  async aoAlterarTransacao(evento: EventoDominio<{ transacaoId: string }>): Promise<void> {
    await this.avaliarTransacao(evento.dados.transacaoId);
  }

  private async avaliarTransacao(transacaoId: string): Promise<void> {
    const agora = this.clock.agora();
    const transacao = await this.repositorio.transacao(transacaoId);
    if (transacao?.tipo !== 'despesa' || transacao.natureza !== 'normal') return;
    const { usuarioId, cartaoId, categoriaId } = transacao;
    const hoje = dataNoFuso(agora, transacao.usuario.fusoHorario);
    const data = deDataDoBanco(transacao.data);
    const candidatos: AlertaCandidato[] = [];
    if (cartaoId !== null) {
      candidatos.push(...(await this.limiteDoCartao(usuarioId, cartaoId, hoje)));
    }
    // Orçamento só do mês de hoje: o lançamento de outro mês não muda o mês que o usuário vive.
    if (competenciaDe(data) === competenciaDe(hoje)) {
      candidatos.push(
        ...(await this.orcamento(usuarioId, categoriaId, transacao.categoria.nome, hoje)),
      );
    }
    candidatos.push(
      ...(await this.foraDoPadrao(
        {
          id: transacao.id,
          usuarioId,
          categoriaId,
          categoria: transacao.categoria.nome,
          descricao: transacao.descricao,
          valorCentavos: Number(transacao.valor),
          data,
        },
        hoje,
      )),
    );
    await this.emitir(candidatos, agora);
  }

  /** Compra parcelada ou dívida: limite do cartão e orçamento do mês. */
  @AoEvento(EVENTO_PARCELAMENTO_REGISTRADO)
  async aoRegistrarParcelamento(evento: EventoDominio<{ parcelamentoId: string }>): Promise<void> {
    const agora = this.clock.agora();
    const parcelamento = await this.repositorio.parcelamento(evento.dados.parcelamentoId);
    if (!parcelamento) return;
    const { usuarioId, cartaoId, categoriaId } = parcelamento;
    const hoje = dataNoFuso(agora, parcelamento.usuario.fusoHorario);
    const candidatos: AlertaCandidato[] = [];
    if (cartaoId !== null) {
      candidatos.push(...(await this.limiteDoCartao(usuarioId, cartaoId, hoje)));
    }
    candidatos.push(
      ...(await this.orcamento(usuarioId, categoriaId, parcelamento.categoria.nome, hoje)),
    );
    await this.emitir(candidatos, agora);
  }

  /** A fatura fechou com valor a pagar (doc 09). */
  @AoEvento(EVENTO_FATURA_FECHADA)
  async aoFecharFatura(evento: EventoDominio<{ faturaId: string }>): Promise<void> {
    const fatura = await this.repositorio.fatura(evento.dados.faturaId);
    const saldoCentavos = fatura ? Number(fatura.valorTotal - fatura.valorPago) : 0;
    if (!fatura || saldoCentavos <= 0) return;
    await this.emitir(
      [
        {
          usuarioId: fatura.usuarioId,
          tipo: 'fatura_fechada',
          chaveUnica: `fatura_fechada:${fatura.id}`,
          urgente: false,
          ...textoFaturaFechada({
            cartao: fatura.cartao.nome,
            saldoCentavos,
            vencimento: deDataDoBanco(fatura.dataVencimento),
          }),
          linkInterno: LINKS_INTERNOS.fatura(fatura.cartaoId, fatura.id),
          vaiParaChat: true,
        },
      ],
      this.clock.agora(),
    );
  }

  /** A fatura venceu sem o total pago: urgente, com [Paguei] (doc 09). */
  @AoEvento(EVENTO_FATURA_ATRASADA)
  async aoAtrasarFatura(evento: EventoDominio<{ faturaId: string }>): Promise<void> {
    const fatura = await this.repositorio.fatura(evento.dados.faturaId);
    const saldoCentavos = fatura ? Number(fatura.valorTotal - fatura.valorPago) : 0;
    if (!fatura || saldoCentavos <= 0) return;
    await this.emitir(
      [
        {
          usuarioId: fatura.usuarioId,
          tipo: 'fatura_atrasada',
          chaveUnica: `fatura_atrasada:${fatura.id}`,
          urgente: true,
          ...textoFaturaAtrasada({
            cartao: fatura.cartao.nome,
            saldoCentavos,
            vencimento: deDataDoBanco(fatura.dataVencimento),
          }),
          linkInterno: LINKS_INTERNOS.fatura(fatura.cartaoId, fatura.id),
          vaiParaChat: true,
        },
      ],
      this.clock.agora(),
    );
  }

  /**
   * Rotina (doc 09): de hora em hora, avalia os usuários em cujo fuso são 09:00. Um erro num
   * usuário vai para o log e não para os outros.
   */
  @Rotina({ nome: 'alertas-diarios', padrao: '5 * * * *' })
  async diarios(agora: Date): Promise<{ usuarios: number; falhas: number }> {
    const fusos = (await this.repositorio.fusos()).filter((fuso) => {
      try {
        return horaNoFuso(agora, fuso).startsWith(HORA_ALERTAS_DIARIOS);
      } catch {
        return false;
      }
    });
    let usuarios = 0;
    let falhas = 0;
    let depoisDe: string | null = null;
    for (;;) {
      const lote = await this.repositorio.usuariosDosFusos(fusos, depoisDe, LOTE_USUARIOS);
      if (lote.length === 0) break;
      for (const usuarioId of lote) {
        try {
          await this.avaliarDiario(usuarioId, agora);
          usuarios += 1;
        } catch (erro) {
          falhas += 1;
          const motivo = erro instanceof Error ? erro.message : String(erro);
          this.log.error(`Alertas diários do usuário ${usuarioId} falharam: ${motivo}`);
        }
      }
      depoisDe = lote.at(-1) ?? null;
    }
    this.log.log(`Alertas diários: ${String(usuarios)} usuário(s), ${String(falhas)} falha(s)`);
    return { usuarios, falhas };
  }

  /** Vencimentos (RN-108) e projeção do mês (RN-107) de um usuário; devolve os candidatos. */
  async avaliarDiario(usuarioId: string, agora: Date): Promise<AlertaCandidato[]> {
    const hoje = dataNoFuso(agora, await this.repositorio.fusoDoUsuario(usuarioId));
    const antecedencias = await this.repositorio.antecedencias(usuarioId, [
      'fatura_vencimento',
      'vencimento_pendente',
    ]);
    const candidatos = [
      ...(await this.vencimentosDeFaturas(
        usuarioId,
        hoje,
        antecedencias.get('fatura_vencimento') ?? ANTECEDENCIA_PADRAO_DIAS,
      )),
      ...(await this.vencimentosPendentes(
        usuarioId,
        hoje,
        antecedencias.get('vencimento_pendente') ?? ANTECEDENCIA_PADRAO_DIAS,
      )),
      ...(await this.projecaoDoMes(usuarioId, hoje)),
    ];
    await this.emitir(candidatos, agora);
    return candidatos;
  }

  /** RN-038: a maior faixa de limite atingida, uma vez por ciclo de fatura (RN-102). */
  private async limiteDoCartao(
    usuarioId: string,
    cartaoId: string,
    hoje: DataCalendario,
  ): Promise<AlertaCandidato[]> {
    const situacao = await this.cartoes.situacaoDoLimite(usuarioId, cartaoId);
    if (!situacao) return [];
    const faixa = faixaAtingida(situacao.limite.percentualUsado, situacao.faixasAlerta);
    if (faixa === null) return [];
    const ciclo = faturaDaCompra(hoje, situacao.dias).competencia.slice(0, 7);
    return [
      {
        usuarioId,
        tipo: 'limite_cartao',
        chaveUnica: `limite:${cartaoId}:${ciclo}:${String(faixa)}`,
        urgente: false,
        ...textoLimiteCartao({
          cartao: situacao.nome,
          faixa,
          usadoCentavos: situacao.limite.limiteUsado,
          totalCentavos: situacao.limite.limiteTotal,
        }),
        linkInterno: LINKS_INTERNOS.cartao(cartaoId),
        vaiParaChat: true,
      },
    ];
  }

  /** RN-062: 80% e 100% do orçamento da categoria no mês de hoje, uma vez cada (RN-102). */
  private async orcamento(
    usuarioId: string,
    categoriaId: string,
    categoria: string,
    hoje: DataCalendario,
  ): Promise<AlertaCandidato[]> {
    const competencia = competenciaDe(hoje);
    const situacao = await this.orcamentos.situacao(usuarioId, categoriaId, competencia);
    if (!situacao) return [];
    const faixa = faixaAtingida(situacao.percentualUsado, ALERTAS_ORCAMENTO);
    if (faixa === null) return [];
    return [
      {
        usuarioId,
        tipo: 'orcamento',
        chaveUnica: `orcamento:${categoriaId}:${competencia.slice(0, 7)}:${String(faixa)}`,
        urgente: false,
        ...textoOrcamento({
          categoria,
          faixa,
          gastoCentavos: situacao.gastoCentavos,
          limiteCentavos: situacao.valorLimiteCentavos,
          competencia,
        }),
        linkInterno: LINKS_INTERNOS.orcamentos(competencia),
        vaiParaChat: true,
      },
    ];
  }

  /** RN-106: despesa recente de 3× a média da categoria nos 90 dias antes dela. */
  private async foraDoPadrao(
    transacao: {
      id: string;
      usuarioId: string;
      categoriaId: string;
      categoria: string;
      descricao: string;
      valorCentavos: number;
      data: DataCalendario;
    },
    hoje: DataCalendario,
  ): Promise<AlertaCandidato[]> {
    const parametros = PARAMETROS_FORA_DO_PADRAO;
    const idade = diasEntre(transacao.data, hoje);
    if (idade < 0 || idade > parametros.diasParaAvaliar) return [];
    if (transacao.valorCentavos < parametros.valorMinimoCentavos) return [];
    const historico = await this.repositorio.historicoDaCategoria(
      transacao.usuarioId,
      transacao.categoriaId,
      somarDias(transacao.data, -parametros.diasDaMedia),
      transacao.data,
      transacao.id,
    );
    if (!foraDoPadrao(transacao.valorCentavos, historico, parametros)) return [];
    return [
      {
        usuarioId: transacao.usuarioId,
        tipo: 'gasto_fora_padrao',
        chaveUnica: `fora_padrao:${transacao.id}`,
        urgente: false,
        ...textoForaDoPadrao({
          categoria: transacao.categoria,
          descricao: transacao.descricao,
          valorCentavos: transacao.valorCentavos,
          mediaCentavos: mediaDaCategoria(historico),
        }),
        linkInterno: LINKS_INTERNOS.transacao(transacao.id),
        vaiParaChat: true,
      },
    ];
  }

  /** RN-108: faturas com saldo, X dias antes e no dia do vencimento. */
  private async vencimentosDeFaturas(
    usuarioId: string,
    hoje: DataCalendario,
    antecedencia: number,
  ): Promise<AlertaCandidato[]> {
    const faturas = await this.repositorio.faturasAVencer(
      usuarioId,
      hoje,
      somarDias(hoje, antecedencia),
    );
    return faturas.flatMap((fatura) => {
      const vencimento = deDataDoBanco(fatura.dataVencimento);
      const dias = diasEntre(hoje, vencimento);
      const marco = marcoDoVencimento(dias, antecedencia);
      if (marco === null) return [];
      return [
        {
          usuarioId,
          tipo: 'fatura_vencimento' as const,
          chaveUnica: `fatura_venc:${fatura.id}:${String(marco)}`,
          urgente: false,
          ...textoFaturaVencimento({
            cartao: fatura.cartao.nome,
            saldoCentavos: Number(fatura.valorTotal - fatura.valorPago),
            vencimento,
            dias,
          }),
          linkInterno: LINKS_INTERNOS.fatura(fatura.cartaoId, fatura.id),
          vaiParaChat: false,
        },
      ];
    });
  }

  /** RN-108: parcelas de dívida e contas pendentes, X dias antes e no dia do vencimento. */
  private async vencimentosPendentes(
    usuarioId: string,
    hoje: DataCalendario,
    antecedencia: number,
  ): Promise<AlertaCandidato[]> {
    const ate = somarDias(hoje, antecedencia);
    const [parcelas, contas] = await Promise.all([
      this.repositorio.parcelasAVencer(usuarioId, hoje, ate),
      this.repositorio.contasAVencer(usuarioId, hoje, ate),
    ]);
    const itens = [
      ...parcelas.map((parcela) => ({
        id: parcela.id,
        descricao: `${parcela.parcelamento.nome} (${String(parcela.numero)}/${String(parcela.parcelamento.totalParcelas)})`,
        valorCentavos: Number(parcela.valor),
        vencimento: deDataDoBanco(parcela.vencimento),
        linkInterno: LINKS_INTERNOS.parcelamento(parcela.parcelamento.id),
      })),
      ...contas.map((conta) => ({
        id: conta.id,
        descricao: conta.descricao,
        valorCentavos: Number(conta.valor),
        vencimento: deDataDoBanco(conta.data),
        linkInterno: LINKS_INTERNOS.transacao(conta.id),
      })),
    ];
    return itens.flatMap((item) => {
      const dias = diasEntre(hoje, item.vencimento);
      const marco = marcoDoVencimento(dias, antecedencia);
      if (marco === null) return [];
      return [
        {
          usuarioId,
          tipo: 'vencimento_pendente' as const,
          chaveUnica: `venc:${item.id}:${String(marco)}`,
          urgente: false,
          ...textoVencimentoPendente({
            descricao: item.descricao,
            valorCentavos: item.valorCentavos,
            vencimento: item.vencimento,
            dias,
          }),
          linkInterno: item.linkInterno,
          vaiParaChat: false,
        },
      ];
    });
  }

  /** RN-107: saldo projetado negativo no fim do mês, no máximo uma vez por semana. */
  private async projecaoDoMes(usuarioId: string, hoje: DataCalendario): Promise<AlertaCandidato[]> {
    const competencia = competenciaDe(hoje);
    const numeros = await this.repositorio.numerosDaProjecao(
      usuarioId,
      { de: competencia, ate: ultimoDiaDaCompetencia(competencia) },
      { de: somarDias(hoje, -JANELA_GASTO_VARIAVEL_DIAS), ate: somarDias(hoje, -1) },
    );
    if (!numeros) return [];
    const saldoProjetadoCentavos = saldoProjetadoDoMes({
      saldoAtualCentavos: numeros.saldoAtualCentavos,
      receitasPendentesCentavos: numeros.receitasPendentesCentavos,
      despesasPendentesCentavos:
        numeros.contasPendentesCentavos +
        numeros.parcelasPendentesCentavos +
        numeros.faturasPendentesCentavos,
      gastoVariavelCentavos: numeros.gastoVariavelCentavos,
      diasDaJanela: JANELA_GASTO_VARIAVEL_DIAS,
      diasRestantes: diasRestantesNoMes(hoje),
    });
    if (saldoProjetadoCentavos >= 0) return [];
    return [
      {
        usuarioId,
        tipo: 'projecao_mes',
        chaveUnica: `projecao:${semanaIso(hoje)}`,
        urgente: false,
        ...textoProjecaoDoMes({ saldoProjetadoCentavos, hoje }),
        linkInterno: LINKS_INTERNOS.inicio(),
        vaiParaChat: true,
      },
    ];
  }

  private async emitir(candidatos: readonly AlertaCandidato[], agora: Date): Promise<void> {
    if (candidatos.length === 0) return;
    await this.motor.emitir(candidatos, agora);
  }
}
