import { Injectable, Logger, Module } from '@nestjs/common';
import type { ProvedorAgendaExterna } from '@mony/shared/agenda';

import { Clock } from '../../core/clock/clock';
import { Configuracao } from '../../core/config/configuracao';
import { CalendarFake } from './calendar-fake';
import { CalendarGoogle } from './calendar-google';
import { CalendarOutlook } from './calendar-outlook';
import type { CalendarProvider } from './calendar.provider';

/**
 * Um `CalendarProvider` por agenda externa: o de verdade quando o cliente OAuth está configurado
 * (Google na T-085g, Outlook na T-085h), senão o falso. Em produção o falso fica indisponível (as
 * rotas de conexão respondem 503).
 */
@Injectable()
export class ProvedoresAgenda {
  private readonly provedores: Record<ProvedorAgendaExterna, CalendarProvider>;

  constructor(config: Configuracao, clock: Clock) {
    const agora = () => clock.agora();
    const google = config.oauthGoogle;
    const microsoft = config.oauthMicrosoft;
    const falsos = [google ? null : 'Google', microsoft ? null : 'Outlook'].filter(
      (nome) => nome !== null,
    );
    if (config.ehProducao && falsos.length > 0) {
      new Logger('Agenda').warn(
        `Agenda falsa em produção (${falsos.join(' e ')}): conectar fica indisponível.`,
      );
    }
    this.provedores = {
      google: google
        ? new CalendarGoogle(google.idCliente, google.segredo, agora)
        : new CalendarFake('google', !config.ehProducao),
      outlook: microsoft
        ? new CalendarOutlook(microsoft.idCliente, microsoft.segredo, agora)
        : new CalendarFake('outlook', !config.ehProducao),
    };
  }

  de(provedor: ProvedorAgendaExterna): CalendarProvider {
    return this.provedores[provedor];
  }
}

/** Agendas externas (doc 10, T-085a). */
@Module({ providers: [ProvedoresAgenda], exports: [ProvedoresAgenda] })
export class IntegracaoAgendaModule {}
