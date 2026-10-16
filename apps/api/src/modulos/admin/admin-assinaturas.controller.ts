import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type AssinaturasAdmin,
  esquemaAssinaturasAdmin,
  esquemaConsultaAssinaturasAdmin,
  esquemaResumoAssinaturasAdmin,
  type ResumoAssinaturasAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminAssinaturasService } from './admin-assinaturas.service';

class ConsultaAssinaturasAdminDto extends criarDto(esquemaConsultaAssinaturasAdmin) {}
class AssinaturasAdminDto extends criarDto(esquemaAssinaturasAdmin) {}
class ResumoAssinaturasAdminDto extends criarDto(esquemaResumoAssinaturasAdmin) {}

/** Assinaturas do painel (T-141b, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/assinaturas')
export class AdminAssinaturasController {
  constructor(private readonly assinaturas: AdminAssinaturasService) {}

  @Get('resumo')
  @ApiOkResponse({
    type: ResumoAssinaturasAdminDto,
    description: 'Contas por situação, conversão do teste nos últimos 30 dias e MRR em centavos.',
  })
  resumo(): Promise<ResumoAssinaturasAdmin> {
    return this.assinaturas.resumo();
  }

  @Get()
  @ApiOkResponse({
    type: AssinaturasAdminDto,
    description: 'As contas de uma situação, das mais novas às mais antigas.',
  })
  listar(@Query() consulta: ConsultaAssinaturasAdminDto): Promise<AssinaturasAdmin> {
    return this.assinaturas.listar(consulta);
  }
}
