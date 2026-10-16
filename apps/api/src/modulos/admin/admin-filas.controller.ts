import { Controller, Get, HttpCode, HttpStatus, Ip, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaConsultaFalhosAdmin,
  esquemaFalhosAdmin,
  esquemaFilaAdmin,
  esquemaFilasAdmin,
  esquemaReprocessadosAdmin,
  type FalhosAdmin,
  type FilasAdmin,
  type ReprocessadosAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminFilasService } from './admin-filas.service';

class FilasAdminDto extends criarDto(esquemaFilasAdmin) {}
class FilaAdminDto extends criarDto(esquemaFilaAdmin) {}
class ConsultaFalhosAdminDto extends criarDto(esquemaConsultaFalhosAdmin) {}
class FalhosAdminDto extends criarDto(esquemaFalhosAdmin) {}
class ReprocessadosAdminDto extends criarDto(esquemaReprocessadosAdmin) {}

/** A seção Filas do painel (T-141g, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/filas')
export class AdminFilasController {
  constructor(private readonly filas: AdminFilasService) {}

  @Get()
  @ApiOkResponse({ type: FilasAdminDto, description: 'Quantos jobs há em cada estado, por fila.' })
  listar(): Promise<FilasAdmin> {
    return this.filas.filas();
  }

  @Get(':fila/falhos')
  @ApiOkResponse({
    type: FalhosAdminDto,
    description: 'Os jobs que esgotaram as tentativas, do mais recente ao mais antigo.',
  })
  falhos(
    @Param() { fila }: FilaAdminDto,
    @Query() consulta: ConsultaFalhosAdminDto,
  ): Promise<FalhosAdmin> {
    return this.filas.falhos(fila, consulta.pagina);
  }

  @Post(':fila/falhos/reprocessar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ReprocessadosAdminDto,
    description: 'Todos os falhos da fila voltam para ela. Grava `auditoria`.',
  })
  reprocessarTodos(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param() { fila }: FilaAdminDto,
    @Ip() ip: string,
  ): Promise<ReprocessadosAdmin> {
    return this.filas.reprocessarTodos(admin.id, fila, ip);
  }

  @Post(':fila/falhos/:id/reprocessar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ReprocessadosAdminDto,
    description: 'O job volta para a fila; 404 se ele não está falho. Grava `auditoria`.',
  })
  reprocessar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param() { fila }: FilaAdminDto,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<ReprocessadosAdmin> {
    return this.filas.reprocessar(admin.id, fila, id, ip);
  }
}
