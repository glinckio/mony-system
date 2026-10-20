import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaAtualizacaoOnboarding,
  esquemaAtualizacaoPerfil,
  esquemaOnboarding,
  esquemaPerfil,
  esquemaRegistroDispositivo,
  esquemaVerificacaoTelefone,
  type Onboarding,
  type Perfil,
} from '@mony/shared/usuario';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { UsuariosService } from './usuarios.service';
import { VerificacaoTelefoneService } from './verificacao-telefone.service';

class PerfilDto extends criarDto(esquemaPerfil) {}
class AtualizacaoPerfilDto extends criarDto(esquemaAtualizacaoPerfil) {}
class RegistroDispositivoDto extends criarDto(esquemaRegistroDispositivo) {}
class OnboardingDto extends criarDto(esquemaOnboarding) {}
class AtualizacaoOnboardingDto extends criarDto(esquemaAtualizacaoOnboarding) {}
class VerificacaoTelefoneDto extends criarDto(esquemaVerificacaoTelefone) {}

/** Rotas do usuário logado (docs/arquitetura/05). */
@ApiTags('usuario')
@ApiBearerAuth()
@Controller('me')
export class UsuariosController {
  constructor(
    private readonly usuarios: UsuariosService,
    private readonly verificacao: VerificacaoTelefoneService,
  ) {}

  @Get()
  @ApiOkResponse({ type: PerfilDto, description: 'Perfil de quem está logado.' })
  perfil(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<Perfil> {
    return this.usuarios.perfil(usuario.id);
  }

  @Patch()
  @ApiOkResponse({ type: PerfilDto, description: 'Perfil depois da mudança.' })
  atualizarPerfil(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: AtualizacaoPerfilDto,
  ): Promise<Perfil> {
    return this.usuarios.atualizarPerfil(usuario.id, dados);
  }

  /** RN-078: o código de 6 dígitos por SMS; telefone já verificado não recebe outro. */
  @Post('telefone/codigo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Código enviado por SMS para o telefone do perfil.' })
  pedirCodigoTelefone(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ): Promise<void> {
    return this.verificacao.pedirCodigo(usuario.id, ip);
  }

  @Post('telefone/verificar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PerfilDto, description: 'Perfil com o telefone verificado.' })
  verificarTelefone(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: VerificacaoTelefoneDto,
    @Ip() ip: string,
  ): Promise<Perfil> {
    return this.verificacao.verificar(usuario.id, dados, ip);
  }

  @Post('dispositivos')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Token de push gravado no aparelho desta sessão.' })
  registrarDispositivo(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: RegistroDispositivoDto,
  ): Promise<void> {
    return this.usuarios.registrarDispositivo(usuario, dados);
  }

  @Get('onboarding')
  @ApiOkResponse({ type: OnboardingDto, description: 'Progresso do onboarding e dicas vistas.' })
  onboarding(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<Onboarding> {
    return this.usuarios.onboarding(usuario.id);
  }

  @Patch('onboarding')
  @ApiOkResponse({ type: OnboardingDto, description: 'Progresso depois da mudança.' })
  atualizarOnboarding(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: AtualizacaoOnboardingDto,
  ): Promise<Onboarding> {
    return this.usuarios.atualizarOnboarding(usuario.id, dados);
  }
}
