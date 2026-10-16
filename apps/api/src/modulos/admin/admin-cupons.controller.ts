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
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type CupomAdmin,
  esquemaCupomAdmin,
  esquemaCuponsAdmin,
  esquemaNovoCupom,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminCuponsService } from './admin-cupons.service';

class NovoCupomDto extends criarDto(esquemaNovoCupom) {}
class CupomAdminDto extends criarDto(esquemaCupomAdmin) {}
class CuponsAdminDto extends criarDto(esquemaCuponsAdmin) {}

/** Cupons do painel (T-104d, doc 13), espelhados na Stripe. Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/cupons')
export class AdminCuponsController {
  constructor(private readonly cupons: AdminCuponsService) {}

  @Get()
  @ApiOkResponse({ type: CuponsAdminDto, description: 'Os cupons, do mais novo ao mais antigo.' })
  listar(): Promise<CupomAdmin[]> {
    return this.cupons.cupons();
  }

  @Post()
  @ApiCreatedResponse({
    type: CupomAdminDto,
    description:
      'Cria o cupom na Stripe com o código para a página de pagamento: desconto em percentual na primeira cobrança (RN-130). 409 se o código já existe.',
  })
  criar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Body() novo: NovoCupomDto,
    @Ip() ip: string,
  ): Promise<CupomAdmin> {
    return this.cupons.criar(admin.id, novo, ip);
  }

  @Post(':id/desativar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CupomAdminDto,
    description: 'O código para de valer no pagamento; quem já usou fica com o desconto.',
  })
  desativar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<CupomAdmin> {
    return this.cupons.desativar(admin.id, id, ip);
  }
}
