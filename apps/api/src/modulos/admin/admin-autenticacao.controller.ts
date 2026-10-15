import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type AdminLogado,
  type DesafioAdmin,
  esquemaAdmin,
  esquemaCodigo2fa,
  esquemaDesafioAdmin,
  esquemaLoginAdmin,
  esquemaNovo2fa,
  esquemaSessaoAdmin,
  type Novo2fa,
  type SessaoAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import { Publico } from '../../core/auth/publico.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { criarDto } from '../../core/openapi/dto';
import { AdminAutenticacaoService } from './admin-autenticacao.service';

class LoginAdminDto extends criarDto(esquemaLoginAdmin) {}
class DesafioAdminDto extends criarDto(esquemaDesafioAdmin) {}
class Novo2faDto extends criarDto(esquemaNovo2fa) {}
class Codigo2faDto extends criarDto(esquemaCodigo2fa) {}
class SessaoAdminDto extends criarDto(esquemaSessaoAdmin) {}
class AdminDto extends criarDto(esquemaAdmin) {}

/** O desafio do 2FA vem no `Authorization: Bearer`, como um token. */
function desafioDo(cabecalho: string | undefined): string {
  const [tipo, token] = (cabecalho ?? '').split(' ');
  if (tipo?.toLowerCase() !== 'bearer' || !token) throw new ErroDominio('SESSAO_INVALIDA');
  return token;
}

/** Login do painel admin (T-104a). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@Controller('admin')
export class AdminAutenticacaoController {
  constructor(private readonly autenticacao: AdminAutenticacaoService) {}

  @Publico()
  @Post('auth/entrar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: DesafioAdminDto,
    description:
      'Senha certa de um admin: o desafio do 2FA (5 minutos). Quem não é admin recebe CREDENCIAIS_INVALIDAS.',
  })
  entrar(@Body() dados: LoginAdminDto, @Ip() ip: string): Promise<DesafioAdmin> {
    return this.autenticacao.entrar(dados, ip);
  }

  @Publico()
  @Post('auth/2fa/novo')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({
    type: Novo2faDto,
    description:
      'Primeiro acesso (com o desafio no Authorization): o segredo do aplicativo autenticador. CONFLITO se o 2FA já está configurado.',
  })
  novo2fa(@Headers('authorization') cabecalho: string | undefined): Promise<Novo2fa> {
    return this.autenticacao.novo2fa(desafioDo(cabecalho));
  }

  @Publico()
  @Post('auth/2fa')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({
    type: SessaoAdminDto,
    description: 'O código do 2FA (com o desafio no Authorization): abre a sessão do painel.',
  })
  conferir2fa(
    @Headers('authorization') cabecalho: string | undefined,
    @Body() dados: Codigo2faDto,
    @Ip() ip: string,
  ): Promise<SessaoAdmin> {
    return this.autenticacao.conferir2fa(desafioDo(cabecalho), dados.codigo, ip);
  }

  @Admin()
  @Post('auth/renovar')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({
    type: SessaoAdminDto,
    description: 'Token novo da mesma sessão, até 8 horas depois do login.',
  })
  renovar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<SessaoAdmin> {
    return this.autenticacao.renovar(usuario);
  }

  @Admin()
  @Get('eu')
  @ApiBearerAuth()
  @ApiOkResponse({ type: AdminDto, description: 'Quem está no painel.' })
  eu(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<AdminLogado> {
    return this.autenticacao.eu(usuario);
  }
}
