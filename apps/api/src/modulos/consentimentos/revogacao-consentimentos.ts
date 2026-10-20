import { Injectable, Logger } from '@nestjs/common';
import type { FinalidadeConsentimento } from '@mony/shared/enums';

import { AgendaService } from '../agenda/agenda.service';
import { AppsCompraService } from '../apps-compra/apps-compra.service';
import { LembretesService } from '../lembretes/lembretes.service';
import { RegistroConsentimentos } from './registro-consentimentos';

/**
 * Revogar desliga o recurso e apaga o que veio dele (doc 11): a agenda desconecta as agendas
 * externas (revoga no provedor e tira os compromissos externos; os criados no app ou pela Mony
 * ficam), os apps de compra derrubam os tokens de evento de todos os aparelhos (a lista fica) e a
 * ligação sai dos lembretes (o que só tinha ligação passa a ter notificação). O Open Finance entra
 * com o provedor (T-140f).
 */
@Injectable()
export class RevogacaoConsentimentos {
  private readonly log = new Logger(RevogacaoConsentimentos.name);

  constructor(
    private readonly registro: RegistroConsentimentos,
    private readonly agenda: AgendaService,
    private readonly apps: AppsCompraService,
    private readonly lembretes: LembretesService,
  ) {}

  /** Sem consentimento que valesse, não faz nada (pedir de novo dá o mesmo resultado). */
  async revogar(usuarioId: string, finalidade: FinalidadeConsentimento): Promise<void> {
    if (!(await this.registro.revogar(usuarioId, finalidade))) return;
    if (finalidade === 'agenda') await this.agenda.revogarTodas(usuarioId);
    if (finalidade === 'apps_compra') await this.apps.desligarDoUsuario(usuarioId);
    if (finalidade === 'ligacao') await this.lembretes.tirarLigacao(usuarioId);
    this.log.log({ usuarioId, finalidade }, 'Consentimento revogado');
  }
}
