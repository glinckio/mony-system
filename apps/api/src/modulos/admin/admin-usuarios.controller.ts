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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaConsultaUsuariosAdmin,
  esquemaEstenderTeste,
  esquemaUsuarioAdmin,
  esquemaUsuariosAdmin,
  type UsuarioAdmin,
  type UsuariosAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminUsuariosService } from './admin-usuarios.service';

class ConsultaUsuariosAdminDto extends criarDto(esquemaConsultaUsuariosAdmin) {}
class UsuariosAdminDto extends criarDto(esquemaUsuariosAdmin) {}
class UsuarioAdminDto extends criarDto(esquemaUsuarioAdmin) {}
class EstenderTesteDto extends criarDto(esquemaEstenderTeste) {}

/** Usuários do painel (T-141a, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/usuarios')
export class AdminUsuariosController {
  constructor(private readonly usuarios: AdminUsuariosService) {}

  @Get()
  @ApiOkResponse({
    type: UsuariosAdminDto,
    description: 'Busca por nome, e-mail ou telefone, das contas mais novas às mais antigas.',
  })
  buscar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Query() consulta: ConsultaUsuariosAdminDto,
    @Ip() ip: string,
  ): Promise<UsuariosAdmin> {
    return this.usuarios.buscar(admin.id, consulta, ip);
  }

  @Get(':id')
  @ApiOkResponse({
    type: UsuarioAdminDto,
    description: 'A conta, o plano, os aparelhos, as sessões e as conexões. Grava na auditoria.',
  })
  usuario(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<UsuarioAdmin> {
    return this.usuarios.usuario(admin.id, id, ip);
  }

  @Post(':id/bloquear')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UsuarioAdminDto,
    description: 'Impede o login e revoga as sessões; não apaga dados. Admin dá 409.',
  })
  bloquear(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<UsuarioAdmin> {
    return this.usuarios.bloquear(admin.id, id, ip);
  }

  @Post(':id/reativar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UsuarioAdminDto, description: 'A conta bloqueada volta a entrar.' })
  reativar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<UsuarioAdmin> {
    return this.usuarios.reativar(admin.id, id, ip);
  }

  @Post(':id/estender-teste')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UsuarioAdminDto,
    description:
      'Soma dias ao teste grátis (do fim atual, ou de agora se já acabou). Plano pago dá 409.',
  })
  estenderTeste(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: EstenderTesteDto,
    @Ip() ip: string,
  ): Promise<UsuarioAdmin> {
    return this.usuarios.estenderTeste(admin.id, id, dados.dias, ip);
  }
}
