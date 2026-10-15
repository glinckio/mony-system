import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaNovoPreco,
  esquemaPlanoGratuitoAdmin,
  esquemaPrecosAdmin,
  type PlanoGratuitoAdmin,
  type PrecosAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminPlanosService } from './admin-planos.service';

class NovoPrecoDto extends criarDto(esquemaNovoPreco) {}
class PrecosAdminDto extends criarDto(esquemaPrecosAdmin) {}
class PlanoGratuitoAdminDto extends criarDto(esquemaPlanoGratuitoAdmin) {}

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

  @Get('gratuito')
  @ApiOkResponse({
    type: PlanoGratuitoAdminDto,
    description: 'Limites do plano gratuito (RN-120) e duração do teste grátis (RN-006).',
  })
  planoGratuito(): Promise<PlanoGratuitoAdmin> {
    return this.planos.planoGratuito();
  }

  @Put('gratuito')
  @ApiOkResponse({
    type: PlanoGratuitoAdminDto,
    description:
      'Grava todos os limites e a duração do teste. Os limites valem na hora; a duração, para os próximos cadastros. `null`: sem limite.',
  })
  salvarPlanoGratuito(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Body() dados: PlanoGratuitoAdminDto,
    @Ip() ip: string,
  ): Promise<PlanoGratuitoAdmin> {
    return this.planos.salvarPlanoGratuito(admin.id, dados, ip);
  }
}
