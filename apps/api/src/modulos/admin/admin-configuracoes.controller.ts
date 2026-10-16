import { Body, Controller, Get, Ip, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type ConfiguracoesAdmin,
  esquemaConfiguracoesAdmin,
  esquemaParametros,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminConfiguracoesService } from './admin-configuracoes.service';

class ParametrosDto extends criarDto(esquemaParametros) {}
class ConfiguracoesAdminDto extends criarDto(esquemaConfiguracoesAdmin) {}

/** A seção Configurações do painel (T-141g, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/configuracoes')
export class AdminConfiguracoesController {
  constructor(private readonly configuracoes: AdminConfiguracoesService) {}

  @Get()
  @ApiOkResponse({
    type: ConfiguracoesAdminDto,
    description: 'Os parâmetros em uso (os padrões enquanto ninguém salvou).',
  })
  ler(): Promise<ConfiguracoesAdmin> {
    return this.configuracoes.ler();
  }

  @Put()
  @ApiOkResponse({
    type: ConfiguracoesAdminDto,
    description:
      'Troca todos os parâmetros. Valem na API e no worker em até 30 s. Grava `auditoria`.',
  })
  salvar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Body() dados: ParametrosDto,
    @Ip() ip: string,
  ): Promise<ConfiguracoesAdmin> {
    return this.configuracoes.salvar(admin.id, dados, ip);
  }
}
