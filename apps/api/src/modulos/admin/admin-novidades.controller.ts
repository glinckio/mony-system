import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaNovaNovidade,
  esquemaNovidadeAdmin,
  esquemaNovidadesAdmin,
  esquemaPublicarNovidade,
  type NovidadeAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminNovidadesService } from './admin-novidades.service';

class NovaNovidadeDto extends criarDto(esquemaNovaNovidade) {}
class PublicarNovidadeDto extends criarDto(esquemaPublicarNovidade) {}
class NovidadeAdminDto extends criarDto(esquemaNovidadeAdmin) {}
class NovidadesAdminDto extends criarDto(esquemaNovidadesAdmin) {}

/** Novidades do painel (T-141d, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/novidades')
export class AdminNovidadesController {
  constructor(private readonly novidades: AdminNovidadesService) {}

  @Get()
  @ApiOkResponse({ type: NovidadesAdminDto, description: 'Da mais nova à mais antiga.' })
  listar(): Promise<NovidadeAdmin[]> {
    return this.novidades.novidades();
  }

  @Post()
  @ApiOkResponse({ type: NovidadeAdminDto, description: 'Cria um rascunho.' })
  criar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Body() dados: NovaNovidadeDto,
    @Ip() ip: string,
  ): Promise<NovidadeAdmin> {
    return this.novidades.criar(admin.id, dados, ip);
  }

  @Put(':id')
  @ApiOkResponse({ type: NovidadeAdminDto, description: 'Edita. A desativada dá 409.' })
  editar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: NovaNovidadeDto,
    @Ip() ip: string,
  ): Promise<NovidadeAdmin> {
    return this.novidades.editar(admin.id, id, dados, ip);
  }

  @Post(':id/publicar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: NovidadeAdminDto,
    description: 'Publica agora ou agenda (`publicarEm`). A que já foi ao ar dá 409.',
  })
  publicar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: PublicarNovidadeDto,
    @Ip() ip: string,
  ): Promise<NovidadeAdmin> {
    return this.novidades.publicar(admin.id, id, dados.publicarEm, ip);
  }

  @Post(':id/desativar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NovidadeAdminDto, description: 'Tira do app.' })
  desativar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<NovidadeAdmin> {
    return this.novidades.desativar(admin.id, id, ip);
  }
}
