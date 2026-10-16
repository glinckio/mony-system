import { Injectable } from '@nestjs/common';

import type { CupomAdmin, NovoCupom } from '@mony/shared/admin';
import { type DataCalendario, dataNoFuso, inicioDoDiaNoFuso } from '@mony/shared/datas';

import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { CobrancaProvider } from '../../integracoes/cobranca/cobranca.provider';
import { AdminCuponsRepository, type LinhaCupom } from './admin-cupons.repository';

/** O dia seguinte de uma data de calendário. */
function diaSeguinte(data: DataCalendario): DataCalendario {
  const meioDia = new Date(`${data}T12:00:00Z`);
  meioDia.setUTCDate(meioDia.getUTCDate() + 1);
  return meioDia.toISOString().slice(0, 10);
}

/**
 * Cupons do painel (T-104d, RN-130). Cada cupom é um desconto na primeira cobrança e um código
 * promocional na Stripe, que a pessoa digita na página de pagamento. A validade é o último dia
 * (fuso de São Paulo, o do painel); o banco guarda o instante em que o código deixa de valer.
 */
@Injectable()
export class AdminCuponsService {
  constructor(
    private readonly repositorio: AdminCuponsRepository,
    private readonly cobranca: CobrancaProvider,
    private readonly clock: Clock,
  ) {}

  async cupons(): Promise<CupomAdmin[]> {
    const agora = this.clock.agora();
    return (await this.repositorio.cupons()).map((linha) => this.paraAdmin(linha, agora));
  }

  /**
   * O código fica reservado no banco antes da Stripe (o índice único decide entre duas criações
   * ao mesmo tempo) e só vale depois que ela responde. Se a Stripe falhar, a reserva é desfeita.
   */
  async criar(adminId: string, novo: NovoCupom, ip: string): Promise<CupomAdmin> {
    const agora = this.clock.agora();
    if (novo.validade !== null && novo.validade < dataNoFuso(agora)) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'A validade não pode ser antes de hoje.',
        detalhes: { campo: 'validade' },
      });
    }
    const codigo = novo.codigo.toUpperCase();
    const expiraEm = novo.validade === null ? null : inicioDoDiaNoFuso(diaSeguinte(novo.validade));
    const id = await this.repositorio.reservar({
      codigo,
      percentual: novo.percentual,
      validade: expiraEm,
      adminId,
      agora,
    });
    if (id === null) {
      throw new ErroDominio('CONFLITO', { mensagem: 'Já existe um cupom com esse código.' });
    }
    try {
      const stripeCouponId = await this.cobranca.criarCupom({
        id,
        codigo,
        percentual: novo.percentual,
        expiraEm,
      });
      await this.repositorio.ativar({ id, stripeCouponId, adminId, ip });
    } catch (erro) {
      await this.repositorio.soltar(id);
      throw erro;
    }
    return this.buscar(id, agora);
  }

  /** Tira o código do pagamento; quem já usou fica com o desconto. Desativar de novo não faz nada. */
  async desativar(adminId: string, id: string, ip: string): Promise<CupomAdmin> {
    const cupom = await this.repositorio.cupom(id);
    if (!cupom) throw new ErroDominio('NAO_ENCONTRADO');
    if (cupom.ativo) {
      await this.cobranca.desativarCupom(cupom.stripeCouponId);
      await this.repositorio.desativar({ id, adminId, ip });
    }
    return this.buscar(id, this.clock.agora());
  }

  private async buscar(id: string, agora: Date): Promise<CupomAdmin> {
    const cupom = await this.repositorio.cupom(id);
    if (!cupom) throw new ErroDominio('NAO_ENCONTRADO');
    return this.paraAdmin(cupom, agora);
  }

  private paraAdmin(linha: LinhaCupom, agora: Date): CupomAdmin {
    return {
      id: linha.id,
      codigo: linha.codigo,
      percentual: linha.percentual,
      // O último dia em que vale: o dia antes do instante em que deixa de valer.
      validade: linha.validade ? dataNoFuso(new Date(linha.validade.getTime() - 1)) : null,
      situacao: !linha.ativo
        ? 'desativado'
        : linha.validade && linha.validade <= agora
          ? 'vencido'
          : 'ativo',
      criadoEm: linha.criadoEm.toISOString(),
      criadoPor: linha.criadoPor,
    };
  }
}
