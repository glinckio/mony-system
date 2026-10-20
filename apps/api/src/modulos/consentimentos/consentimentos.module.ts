import { Module } from '@nestjs/common';

import { AgendaModule } from '../agenda/agenda.module';
import { AppsCompraModule } from '../apps-compra/apps-compra.module';
import { LembretesModule } from '../lembretes/lembretes.module';
import { ConsentimentosController } from './consentimentos.controller';
import { RegistroConsentimentosModule } from './registro-consentimentos';
import { RevogacaoConsentimentos } from './revogacao-consentimentos';

/** Consentimentos (LGPD, T-140d): a lista e a revogação, que desliga cada recurso. */
@Module({
  imports: [RegistroConsentimentosModule, AgendaModule, AppsCompraModule, LembretesModule],
  controllers: [ConsentimentosController],
  providers: [RevogacaoConsentimentos],
})
export class ConsentimentosModule {}
