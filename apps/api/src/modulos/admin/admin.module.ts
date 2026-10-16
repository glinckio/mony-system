import { Module } from '@nestjs/common';

import { CifraSegredos } from '../../core/auth/cifra-segredos';
import { FilasModule } from '../../core/filas/filas.module';
import { CobrancaModule } from '../../integracoes/cobranca/cobranca.module';
import { MetricasModule } from '../metricas/metricas.module';
import { MonyModule } from '../mony/mony.module';
import { AdminAssinaturasController } from './admin-assinaturas.controller';
import { AdminAssinaturasRepository } from './admin-assinaturas.repository';
import { AdminAssinaturasService } from './admin-assinaturas.service';
import { AdminAuditoriaController } from './admin-auditoria.controller';
import { AdminAuditoriaRepository } from './admin-auditoria.repository';
import { AdminAuditoriaService } from './admin-auditoria.service';
import { AdminConfiguracoesController } from './admin-configuracoes.controller';
import { AdminConfiguracoesRepository } from './admin-configuracoes.repository';
import { AdminConfiguracoesService } from './admin-configuracoes.service';
import { AdminAutenticacaoController } from './admin-autenticacao.controller';
import { AdminAutenticacaoRepository } from './admin-autenticacao.repository';
import { AdminAutenticacaoService } from './admin-autenticacao.service';
import { AdminCuponsController } from './admin-cupons.controller';
import { AdminCuponsRepository } from './admin-cupons.repository';
import { AdminCuponsService } from './admin-cupons.service';
import { AdminFilasController } from './admin-filas.controller';
import { AdminFilasService } from './admin-filas.service';
import { AdminMetricasController } from './admin-metricas.controller';
import { AdminMetricasService } from './admin-metricas.service';
import { AdminMonyController } from './admin-mony.controller';
import { AdminMonyRepository } from './admin-mony.repository';
import { AdminMonyService } from './admin-mony.service';
import { AdminNovidadesController } from './admin-novidades.controller';
import { AdminNovidadesRepository } from './admin-novidades.repository';
import { AdminNovidadesService } from './admin-novidades.service';
import { AdminPlanosController } from './admin-planos.controller';
import { AdminPlanosRepository } from './admin-planos.repository';
import { AdminPlanosService } from './admin-planos.service';
import { AdminUsuariosController } from './admin-usuarios.controller';
import { AdminUsuariosRepository } from './admin-usuarios.repository';
import { AdminUsuariosService } from './admin-usuarios.service';

/**
 * O painel admin (`/v1/admin/*`, docs/arquitetura/13): login (T-104a), planos (T-104b e T-104c),
 * cupons (T-104d), usuários (T-141a), assinaturas (T-141b), auditoria (T-141c), novidades (T-141d),
 * Mony (T-141e), métricas (T-141f), filas e configurações (T-141g).
 */
@Module({
  imports: [CobrancaModule, FilasModule, MonyModule, MetricasModule],
  controllers: [
    AdminAutenticacaoController,
    AdminPlanosController,
    AdminCuponsController,
    AdminUsuariosController,
    AdminAssinaturasController,
    AdminAuditoriaController,
    AdminNovidadesController,
    AdminMonyController,
    AdminMetricasController,
    AdminFilasController,
    AdminConfiguracoesController,
  ],
  providers: [
    AdminAutenticacaoService,
    AdminAutenticacaoRepository,
    CifraSegredos,
    AdminPlanosService,
    AdminPlanosRepository,
    AdminCuponsService,
    AdminCuponsRepository,
    AdminUsuariosService,
    AdminUsuariosRepository,
    AdminAssinaturasService,
    AdminAssinaturasRepository,
    AdminAuditoriaService,
    AdminAuditoriaRepository,
    AdminNovidadesService,
    AdminNovidadesRepository,
    AdminMonyService,
    AdminMonyRepository,
    AdminMetricasService,
    AdminFilasService,
    AdminConfiguracoesService,
    AdminConfiguracoesRepository,
  ],
})
export class AdminModule {}
