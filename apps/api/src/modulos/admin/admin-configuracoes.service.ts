import { Injectable } from '@nestjs/common';
import type { ConfiguracoesAdmin, Parametros } from '@mony/shared/admin';

import { ParametrosService } from '../../core/parametros/parametros';
import { AdminConfiguracoesRepository } from './admin-configuracoes.repository';

/**
 * Configurações do painel (T-141g, doc 13): parâmetros dos alertas (RN-103, RN-104, RN-106),
 * limite mensal de ligações (RN-078) e versão mínima do app. A API e o worker leem pelo
 * `ParametrosService`, que guarda o que leu por 30 s.
 */
@Injectable()
export class AdminConfiguracoesService {
  constructor(
    private readonly repositorio: AdminConfiguracoesRepository,
    private readonly parametros: ParametrosService,
  ) {}

  async ler(): Promise<ConfiguracoesAdmin> {
    this.parametros.esquecer();
    const [parametros, alteracao] = await Promise.all([
      this.parametros.obter(),
      this.repositorio.alteracao(),
    ]);
    return {
      parametros,
      alteradoEm: alteracao?.atualizadoEm.toISOString() ?? null,
      alteradoPor: alteracao?.alteradoPor ?? null,
    };
  }

  /** Troca tudo de uma vez; a auditoria guarda o antes e o depois. */
  async salvar(adminId: string, parametros: Parametros, ip: string): Promise<ConfiguracoesAdmin> {
    this.parametros.esquecer();
    const antes = await this.parametros.obter();
    await this.repositorio.salvar({ parametros, antes, adminId, ip });
    return this.ler();
  }
}
