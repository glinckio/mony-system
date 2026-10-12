import { Module } from '@nestjs/common';

import { IaModule } from '../../integracoes/ia/ia.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { CategoriasModule } from '../categorias/categorias.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ContextoMonyService } from './contexto.service';
import { ListarCategoriasTool } from './ferramentas/listar-categorias.tool';
import { FERRAMENTAS_MONY, type Ferramenta, RegistroFerramentas } from './ferramentas/registro';
import { MonyController } from './mony.controller';
import { MonyRepository } from './mony.repository';
import { MonyService } from './mony.service';
import { MonyOrquestrador } from './orquestrador.service';
import { RoteadorRegras } from './roteador-regras.service';

/** Ferramentas que o modelo pode chamar; as de finanças entram na T-062. */
const FERRAMENTAS = [ListarCategoriasTool];

/**
 * Mony (doc 08): orquestrador (regras, modelo e ferramentas), histórico da conversa e `logs_ia`.
 * Ferramentas e contexto só chamam Services de outros módulos (doc 05).
 */
@Module({
  imports: [
    IaModule,
    CartoesModule,
    CategoriasModule,
    OrcamentosModule,
    TransacoesModule,
    UsuariosModule,
  ],
  controllers: [MonyController],
  providers: [
    MonyOrquestrador,
    MonyService,
    MonyRepository,
    RoteadorRegras,
    ContextoMonyService,
    RegistroFerramentas,
    ...FERRAMENTAS,
    {
      provide: FERRAMENTAS_MONY,
      inject: FERRAMENTAS,
      useFactory: (...ferramentas: Ferramenta[]) => ferramentas,
    },
  ],
})
export class MonyModule {}
