import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Dashboard, esquemaConsultaDashboard, esquemaDashboard } from '@mony/shared/dashboard';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { DashboardService } from './dashboard.service';

class DashboardDto extends criarDto(esquemaDashboard) {}
class ConsultaDashboardDto extends criarDto(esquemaConsultaDashboard) {}

/** Início em uma chamada (doc 04 e 05; RN-020 a RN-024). */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOkResponse({
    type: DashboardDto,
    description:
      'Resumo do período, próximos vencimentos, cartões, orçamentos do mês e checklist do onboarding.',
  })
  obter(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaDashboardDto,
  ): Promise<Dashboard> {
    return this.dashboard.obter(contexto, consulta);
  }
}
