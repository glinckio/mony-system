import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { esquemaNovoPreco, esquemaPrecosAdmin, type PrecosAdmin } from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminPlanosService } from './admin-planos.service';

class NovoPrecoDto extends criarDto(esquemaNovoPreco) {}
class PrecosAdminDto extends criarDto(esquemaPrecosAdmin) {}

/** Planos e preços do painel (T-104b, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/planos')
export class AdminPlanosController {
  constructor(private readonly planos: AdminPlanosService) {}

  @Get('precos')
  @ApiOkResponse({
    type: PrecosAdminDto,
    description: 'O preço vigente de cada plano e o histórico, com data e autor (RN-129).',
  })
  precos(): Promise<PrecosAdmin> {
    return this.planos.precos();
  }

  @Post('precos')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: PrecosAdminDto,
    description:
      'Valor novo de um plano: cria um preço novo na Stripe, que passa a ser o vendido. Quem já assina fica no preço antigo (RN-129).',
  })
  alterar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Body() novo: NovoPrecoDto,
    @Ip() ip: string,
  ): Promise<PrecosAdmin> {
    return this.planos.alterar(admin.id, novo, ip);
  }
}
