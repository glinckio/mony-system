import { Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';

import type { NovoPreco, PlanoGratuitoAdmin, PrecosAdmin } from '@mony/shared/admin';

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

  planoGratuito(): Promise<PlanoGratuitoAdmin> {
    return this.repositorio.planoGratuito();
  }

  /**
   * Limites do gratuito (RN-120) e duração do teste (RN-006), T-104c. Os limites valem na hora: a
   * cota lê `limites_plano` a cada uso (RN-122). A duração vale para os cadastros seguintes; quem
   * já está no teste mantém o fim que tinha. Sem mudança, não grava nem audita.
   */
  async salvarPlanoGratuito(
    adminId: string,
    dados: PlanoGratuitoAdmin,
    ip: string,
  ): Promise<PlanoGratuitoAdmin> {
    const antes = await this.repositorio.planoGratuito();
    const ordenado = (plano: PlanoGratuitoAdmin): PlanoGratuitoAdmin => ({
      duracaoTesteDias: plano.duracaoTesteDias,
      limitesDeUso: [...plano.limitesDeUso].sort((a, b) => a.recurso.localeCompare(b.recurso)),
      limitesDeQuantidade: [...plano.limitesDeQuantidade].sort((a, b) =>
        a.recurso.localeCompare(b.recurso),
      ),
    });
    if (!isDeepStrictEqual(ordenado(antes), ordenado(dados))) {
      await this.repositorio.salvarPlanoGratuito({ dados, antes, adminId, ip });
    }
    return this.repositorio.planoGratuito();
  }
}
