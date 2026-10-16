import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type AuditoriaAdmin,
  esquemaAuditoriaAdmin,
  esquemaConsultaAuditoriaAdmin,
  esquemaFiltrosAuditoriaAdmin,
  type FiltrosAuditoriaAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminAuditoriaService } from './admin-auditoria.service';

class ConsultaAuditoriaAdminDto extends criarDto(esquemaConsultaAuditoriaAdmin) {}
class AuditoriaAdminDto extends criarDto(esquemaAuditoriaAdmin) {}
class FiltrosAuditoriaAdminDto extends criarDto(esquemaFiltrosAuditoriaAdmin) {}

/** Auditoria do painel (T-141c, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/auditoria')
export class AdminAuditoriaController {
  constructor(private readonly auditoria: AdminAuditoriaService) {}

  @Get()
  @ApiOkResponse({
    type: AuditoriaAdminDto,
    description:
      'As ações dos admins, da mais nova à mais antiga. Filtros por admin, ação, entidade e período (dias de São Paulo).',
  })
  registros(@Query() consulta: ConsultaAuditoriaAdminDto): Promise<AuditoriaAdmin> {
    return this.auditoria.registros(consulta);
  }

  @Get('filtros')
  @ApiOkResponse({
    type: FiltrosAuditoriaAdminDto,
    description: 'Os admins, as ações e as entidades que aparecem no registro.',
  })
  filtros(): Promise<FiltrosAuditoriaAdmin> {
    return this.auditoria.filtros();
  }
}
