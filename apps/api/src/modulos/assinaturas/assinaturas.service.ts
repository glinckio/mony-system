import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { LINKS_INTERNOS } from '@mony/shared/alertas';
import type { PlanoPago } from '@mony/shared/enums';
import type {
  FormaPagamentoPlano,
  LinkCobranca,
  PlanosAVenda,
  ResultadoRetornoCobranca,
  SituacaoAssinaturaPaga,
} from '@mony/shared/planos';
import type { Queue } from 'bullmq';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { FILAS, idDeJob } from '../../core/filas/filas';
import { Rotina } from '../../core/rotinas/rotinas';
import {
  CobrancaProvider,
  ErroAssinaturaWebhook,
  type EventoGravado,
} from '../../integracoes/cobranca/cobranca.provider';
import { Configuracao } from '../../core/config/configuracao';
import { type AlertaCandidato, MotorAlertas } from '../notificacoes/motor-alertas';
import { planoEfetivo } from '../planos/dominio/cotas';
import { type AssinaturaDoCliente, AssinaturasRepository } from './assinaturas.repository';
import {
  avisoDeEncerramento,
  avisoDePagamentoRecusado,
  avisoDeRenovacao,
  avisoDoFimDoPix,
  avisoDoPix,
  avisoDoPixEncerrado,
  mudancaDaAssinatura,
  mudancaDoPagamentoPix,
  type TextoDoAviso,
} from './dominio/assinatura';

/** O job da fila `webhooks`: o id da linha de `webhook_eventos`. */
export interface JobWebhook {
  webhookEventoId: string;
}

/** Link do app que o retorno da Stripe abre (`mony://planos?checkout=sucesso`). */
export function linkDoRetorno(resultado: ResultadoRetornoCobranca): string {
  return `${LINKS_INTERNOS.planos()}?checkout=${resultado}`;
}

/**
 * Assinaturas pagas (doc 10, T-102): planos à venda, checkout e portal da Stripe, e os eventos do
 * webhook, que mudam o plano na hora (RN-128) e avisam da cobrança recusada (RN-131).
 */
@Injectable()
export class AssinaturasService {
  private readonly log = new Logger(AssinaturasService.name);

  constructor(
    private readonly repositorio: AssinaturasRepository,
    private readonly cobranca: CobrancaProvider,
    private readonly config: Configuracao,
    private readonly clock: Clock,
    private readonly motor: MotorAlertas,
    @InjectQueue(FILAS.webhooks) private readonly fila: Queue<JobWebhook>,
  ) {}

  /** `GET /planos`: os preços vigentes (RN-129). */
  async planos(): Promise<PlanosAVenda> {
    const precos = await this.repositorio.precosVigentes();
    return { planos: precos.map(({ plano, valorCentavos }) => ({ plano, valorCentavos })) };
  }

  /** `GET /assinatura`: o plano que vale agora e a assinatura paga, se houver. */
  async situacao(contexto: Contexto): Promise<SituacaoAssinaturaPaga> {
    const assinatura = await this.repositorio.doUsuario(usuarioDoContexto(contexto));
    if (!assinatura) throw new ErroDominio('NAO_ENCONTRADO');
    const plano = planoEfetivo(assinatura, this.clock.agora());
    const paga = plano === 'mensal' || plano === 'anual';
    return {
      plano,
      status: paga ? assinatura.status : null,
      valorCentavos: paga ? assinatura.valorCentavos : null,
      proximaCobranca: paga ? (assinatura.proximaCobranca?.toISOString() ?? null) : null,
      cancelamentoAgendado: paga && assinatura.cancelamentoAgendado,
      testeFim: plano === 'teste' ? (assinatura.testeFim?.toISOString() ?? null) : null,
      gerenciavel: assinatura.stripeCustomerId !== null,
      pagoAte: paga ? (assinatura.pagoAte?.toISOString() ?? null) : null,
    };
  }

  /**
   * `POST /assinatura/checkout`: a página da Stripe para assinar o plano pelo preço vigente. Quem já
   * paga troca de plano pelo portal, para a Stripe acertar a diferença. Com `pix` (só no anual,
   * T-105), um pagamento único que libera 12 meses; quem já está no anual pago com Pix pode pagar
   * mais 12 meses antes do fim, sem perder os dias que faltam.
   */
  async checkout(
    contexto: Contexto,
    plano: PlanoPago,
    forma: FormaPagamentoPlano = 'cartao',
  ): Promise<LinkCobranca> {
    const usuarioId = usuarioDoContexto(contexto);
    const assinatura = await this.repositorio.doUsuario(usuarioId);
    if (!assinatura) throw new ErroDominio('NAO_ENCONTRADO');
    if (forma === 'pix' && plano !== 'anual') {
      throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'O Pix vale só no plano anual.' });
    }
    const atual = planoEfetivo(assinatura, this.clock.agora());
    const renovaPix = forma === 'pix' && atual === 'anual' && assinatura.pagoAte !== null;
    if ((atual === 'mensal' || atual === 'anual') && !renovaPix) {
      throw new ErroDominio('ASSINATURA_JA_ATIVA');
    }
    const preco = (await this.repositorio.precosVigentes()).find((p) => p.plano === plano);
    if (!preco) {
      throw new ErroDominio('SERVICO_INDISPONIVEL', {
        mensagem: 'Este plano ainda não está à venda.',
      });
    }
    return this.naCobranca(async () => {
      const clienteId = await this.cliente(usuarioId, assinatura);
      if (forma === 'pix') {
        return this.cobranca.criarPagamentoPix({
          clienteId,
          usuarioId,
          planoPrecoId: preco.id,
          valorCentavos: preco.valorCentavos,
          urlSucesso: this.urlDoRetorno('sucesso'),
          urlCancelado: this.urlDoRetorno('cancelado'),
        });
      }
      return this.cobranca.criarCheckout({
        clienteId,
        precoId: preco.stripePriceId,
        usuarioId,
        urlSucesso: this.urlDoRetorno('sucesso'),
        urlCancelado: this.urlDoRetorno('cancelado'),
      });
    });
  }

  /** `POST /assinatura/portal`: trocar plano, cartão e cancelar, na Stripe. */
  async portal(contexto: Contexto): Promise<LinkCobranca> {
    const assinatura = await this.repositorio.doUsuario(usuarioDoContexto(contexto));
    const clienteId = assinatura?.stripeCustomerId;
    if (!clienteId) throw new ErroDominio('ASSINATURA_SEM_CLIENTE');
    return this.naCobranca(() =>
      this.cobranca.criarPortal({ clienteId, urlRetorno: this.urlDoRetorno('portal') }),
    );
  }

  /**
   * `POST /webhooks/stripe` (doc 05, "Webhooks"): confere a assinatura do corpo bruto, registra o
   * evento uma vez só e põe na fila. Responde logo; o worker processa com novas tentativas.
   */
  async receberWebhook(corpo: Buffer | undefined, assinatura: string | undefined): Promise<void> {
    if (corpo === undefined) throw new ErroDominio('REQUISICAO_INVALIDA');
    let evento;
    try {
      evento = this.cobranca.lerEvento(corpo, assinatura);
    } catch (erro) {
      if (erro instanceof ErroAssinaturaWebhook) {
        this.log.warn(`Webhook da Stripe recusado: ${erro.message}`);
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'Assinatura do webhook inválida.',
        });
      }
      throw erro;
    }
    if (evento.tipo === 'ignorado') return;
    const registrado = await this.repositorio.registrarEvento(evento);
    if (registrado.processadoEm !== null) return;
    await this.fila.add(
      evento.tipo,
      { webhookEventoId: registrado.id },
      { jobId: idDeJob('stripe', evento.id) },
    );
  }

  /**
   * RN-161 (T-140b): o pedido de exclusão da conta agenda o cancelamento da assinatura paga no fim
   * do período, para não cobrar a renovação durante os 7 dias. Devolve `true` se foi o pedido que
   * agendou (sem assinatura, já cancelada ou com o cancelamento já agendado pela pessoa: `false`).
   */
  async agendarCancelamentoDaExclusao(usuarioId: string): Promise<boolean> {
    const assinatura = await this.repositorio.doUsuario(usuarioId);
    if (
      assinatura?.stripeSubscriptionId == null ||
      assinatura.status === 'cancelada' ||
      assinatura.cancelamentoAgendado
    ) {
      return false;
    }
    await this.naCobranca(() =>
      this.cobranca.agendarCancelamento(assinatura.stripeSubscriptionId ?? '', true),
    );
    await this.repositorio.marcarCancelamentoAgendado(usuarioId, true);
    return true;
  }

  /** RN-161: quem desistiu da exclusão volta a ter a renovação que tinha. */
  async desfazerCancelamentoDaExclusao(usuarioId: string): Promise<void> {
    const assinatura = await this.repositorio.doUsuario(usuarioId);
    if (assinatura?.stripeSubscriptionId == null || assinatura.status === 'cancelada') return;
    await this.naCobranca(() =>
      this.cobranca.agendarCancelamento(assinatura.stripeSubscriptionId ?? '', false),
    );
    await this.repositorio.marcarCancelamentoAgendado(usuarioId, false);
  }

  /** RN-161: na exclusão definitiva, a assinatura acaba na hora e não cobra mais nada. */
  async cancelarParaExclusao(usuarioId: string): Promise<void> {
    const assinatura = await this.repositorio.doUsuario(usuarioId);
    if (assinatura?.stripeSubscriptionId == null) return;
    await this.cobranca.cancelarAssinatura(assinatura.stripeSubscriptionId);
  }

  /** O worker processa um evento da fila `webhooks`. Repetir é seguro. */
  async processarEvento(webhookEventoId: string): Promise<void> {
    const registrado = await this.repositorio.evento(webhookEventoId);
    if (!registrado || registrado.processadoEm !== null) return;
    try {
      await this.aplicar(registrado.evento);
    } catch (erro) {
      await this.repositorio.falhaNoEvento(
        webhookEventoId,
        erro instanceof Error ? erro.message : String(erro),
      );
      throw erro;
    }
    await this.repositorio.concluirEvento(webhookEventoId, this.clock.agora());
  }

  /**
   * T-105 (doc 09): todo dia às 01:20, o anual pago com Pix que venceu passa para o gratuito.
   * Antes disso ele já vale como gratuito (`planoEfetivo`); a rotina grava.
   */
  @Rotina({ nome: 'encerrar-pix-vencidos', padrao: '20 1 * * *' })
  async encerrarPixVencidos(agora: Date): Promise<{ encerrados: number }> {
    const encerrados = await this.repositorio.encerrarPixVencidos(agora);
    if (encerrados > 0) this.log.log(`Anuais com Pix encerrados: ${String(encerrados)}`);
    return { encerrados };
  }

  /**
   * T-105: na rodada das 09:00 (`alertas-diarios`), o aviso 7 dias antes do fim do anual pago com
   * Pix, que não renova sozinho, e o do fim. Um de cada por fim de período.
   */
  async avisosDoPix(usuarioId: string, agora: Date, fuso: string): Promise<AlertaCandidato[]> {
    const pagoAte = await this.repositorio.pagoAte(usuarioId);
    if (pagoAte === null) return [];
    const aviso = avisoDoPix(pagoAte, agora);
    if (aviso === null) return [];
    const texto = aviso === 'fim_proximo' ? avisoDoFimDoPix(pagoAte, fuso) : avisoDoPixEncerrado();
    return [
      {
        usuarioId,
        tipo: 'assinatura',
        chaveUnica: `assinatura:pix:${aviso}:${pagoAte.toISOString()}`,
        // Aviso, não cobrança: espera o fim do horário de silêncio (RN-101).
        urgente: false,
        titulo: texto.titulo,
        corpo: texto.corpo,
        linkInterno: LINKS_INTERNOS.planos(),
        vaiParaChat: true,
      },
    ];
  }

  private async aplicar(evento: EventoGravado): Promise<void> {
    if (evento.tipo === 'pagamento_unico') {
      await this.aplicarPagamentoPix(evento);
      return;
    }
    const externa = await this.cobranca.buscarAssinatura(evento.assinaturaId);
    if (!externa) {
      this.log.warn(
        `Evento ${evento.id}: a Stripe não conhece a assinatura ${evento.assinaturaId}`,
      );
      return;
    }
    const gravada = await this.repositorio.doCliente(externa.clienteId);
    if (!gravada) {
      // Cliente criado fora do app (no painel da Stripe, por exemplo): não é de ninguém aqui.
      this.log.warn(`Evento ${evento.id}: nenhuma assinatura com o cliente ${externa.clienteId}`);
      return;
    }
    // A conta foi excluída (RN-161): o cancelamento que ela mesma pediu não vira aviso.
    if (gravada.contaExcluida) return;
    const agora = this.clock.agora();
    const preco = externa.precoId ? await this.repositorio.precoDaStripe(externa.precoId) : null;
    const mudanca = mudancaDaAssinatura(gravada, externa, preco, agora);
    if (mudanca.tipo !== 'nenhuma')
      await this.repositorio.atualizar(gravada.usuarioId, mudanca.dados);

    // Os avisos só valem para a assinatura que está gravada agora.
    if (mudanca.tipo !== 'paga' && gravada.stripeSubscriptionId !== externa.id) return;
    if (mudanca.tipo === 'encerrada') {
      await this.avisar(gravada, evento.id, avisoDeEncerramento(), agora);
    } else if (evento.tipo === 'pagamento_recusado') {
      const aviso = avisoDePagamentoRecusado(
        {
          valorCentavos: evento.valorCentavos,
          proximaTentativa: evento.proximaTentativa ? new Date(evento.proximaTentativa) : null,
        },
        gravada.fuso,
      );
      await this.avisar(gravada, evento.id, aviso, agora);
    } else if (
      evento.tipo === 'renovacao_proxima' &&
      externa.situacao === 'ativa' &&
      !externa.cancelamentoAgendado
    ) {
      const aviso = avisoDeRenovacao(
        { valorCentavos: evento.valorCentavos, data: new Date(evento.data) },
        gravada.fuso,
      );
      await this.avisar(gravada, evento.id, aviso, agora);
    }
  }

  /** T-105: o anual pago com Pix vale na hora (RN-128). */
  private async aplicarPagamentoPix(
    evento: Extract<EventoGravado, { tipo: 'pagamento_unico' }>,
  ): Promise<void> {
    const gravada = await this.repositorio.doCliente(evento.clienteId);
    if (!gravada) {
      this.log.warn(`Evento ${evento.id}: nenhuma assinatura com o cliente ${evento.clienteId}`);
      return;
    }
    const mudanca = mudancaDoPagamentoPix(gravada, evento, this.clock.agora());
    if (mudanca.tipo === 'conflito') {
      // O checkout recusa quem já assina no cartão; só dois pagamentos ao mesmo tempo chegam aqui.
      this.log.error(
        `Evento ${evento.id}: Pix pago (${String(evento.valorCentavos)} centavos) por quem já assina no cartão (usuário ${gravada.usuarioId}); devolver pelo painel da Stripe`,
      );
      return;
    }
    if (mudanca.tipo === 'paga') await this.repositorio.atualizar(gravada.usuarioId, mudanca.dados);
  }

  /** Tipo `assinatura` (doc 09): urgente, não desliga, vai para o chat; a chave é o evento. */
  private async avisar(
    gravada: AssinaturaDoCliente,
    eventoId: string,
    texto: TextoDoAviso,
    agora: Date,
  ): Promise<void> {
    const alerta: AlertaCandidato = {
      usuarioId: gravada.usuarioId,
      tipo: 'assinatura',
      chaveUnica: `assinatura:${eventoId}`,
      urgente: true,
      titulo: texto.titulo,
      corpo: texto.corpo,
      linkInterno: LINKS_INTERNOS.planos(),
      vaiParaChat: true,
    };
    await this.motor.emitir([alerta], agora);
  }

  /** O cliente da Stripe da pessoa, criado no primeiro checkout. */
  private async cliente(
    usuarioId: string,
    assinatura: { stripeCustomerId: string | null; email: string; nome: string },
  ): Promise<string> {
    if (assinatura.stripeCustomerId !== null) return assinatura.stripeCustomerId;
    const criado = await this.cobranca.criarCliente({
      usuarioId,
      email: assinatura.email,
      nome: assinatura.nome,
    });
    return (await this.repositorio.gravarCliente(usuarioId, criado)) ?? criado;
  }

  private urlDoRetorno(resultado: ResultadoRetornoCobranca): string {
    return `${this.config.urlPublicaApi}/v1/assinatura/retorno?resultado=${resultado}`;
  }

  /** A Stripe fora do ar vira 503, com uma frase para a tela. */
  private async naCobranca<T>(operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao();
    } catch (erro) {
      if (erro instanceof ErroDominio) throw erro;
      this.log.error(`Falha na Stripe: ${erro instanceof Error ? erro.message : String(erro)}`);
      throw new ErroDominio('SERVICO_INDISPONIVEL', {
        mensagem: 'Não conseguimos abrir o pagamento agora. Tente de novo em instantes.',
      });
    }
  }
}
