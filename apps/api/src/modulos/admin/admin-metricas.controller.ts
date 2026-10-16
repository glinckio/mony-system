import { Controller, Get, HttpCode, HttpStatus, Ip, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaAtualizacaoMetricasAdmin,
  esquemaConsultaMetricasAdmin,
  esquemaMetricasAdmin,
  type MetricasAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminMetricasService } from './admin-metricas.service';

class ConsultaMetricasAdminDto extends criarDto(esquemaConsultaMetricasAdmin) {}
class MetricasAdminDto extends criarDto(esquemaMetricasAdmin) {}
class AtualizacaoMetricasAdminDto extends criarDto(esquemaAtualizacaoMetricasAdmin) {}

/** Métricas do painel (T-141f, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/metricas')
export class AdminMetricasController {
  constructor(private readonly metricas: AdminMetricasService) {}

  @Get()
  @ApiOkResponse({
    type: MetricasAdminDto,
    description:
      'Usuários ativos, lançamentos por origem e alertas no período (dias de São Paulo), pelas views.',
  })
  ler(@Query() consulta: ConsultaMetricasAdminDto): Promise<MetricasAdmin> {
    return this.metricas.metricas(consulta);
  }

  @Post('atualizar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: AtualizacaoMetricasAdminDto,
    description: 'Atualiza as views agora, sem esperar a rotina de hora em hora.',
  })
  atualizar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Ip() ip: string,
  ): Promise<{ atualizadasEm: string }> {
    return this.metricas.atualizar(admin.id, ip);
  }
}
