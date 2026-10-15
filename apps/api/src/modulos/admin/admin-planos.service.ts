import { Injectable } from '@nestjs/common';
import type { NovoPreco, PrecosAdmin } from '@mony/shared/admin';

import { Clock } from '../../core/clock/clock';
import { CobrancaProvider } from '../../integracoes/cobranca/cobranca.provider';
import { AdminPlanosRepository } from './admin-planos.repository';

/**
 * Preços dos planos pelo painel (T-104b, RN-129): o valor novo cria um preço novo no provedor, que
 * passa a ser o vendido; quem já assina continua no preço em que entrou.
 */
@Injectable()
export class AdminPlanosService {
  constructor(
    private readonly repositorio: AdminPlanosRepository,
    private readonly cobranca: CobrancaProvider,
    private readonly clock: Clock,
  ) {}

  async precos(): Promise<PrecosAdmin> {
    const historico = await this.repositorio.precos();
    return { vigentes: historico.filter((preco) => preco.vigente), historico };
  }

  /** O mesmo valor do vigente não cria nada: devolve a tabela como está. */
  async alterar(adminId: string, novo: NovoPreco, ip: string): Promise<PrecosAdmin> {
    const antes = await this.repositorio.vigente(novo.plano);
    if (antes?.valorCentavos !== novo.valorCentavos) {
      const stripePriceId = await this.cobranca.criarPreco(novo);
      await this.repositorio.tornarVigente({
        ...novo,
        stripePriceId,
        adminId,
        ip,
        antes,
        agora: this.clock.agora(),
      });
    }
    return this.precos();
  }
}
