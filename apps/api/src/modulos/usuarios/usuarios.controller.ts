import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaAtualizacaoOnboarding,
  esquemaAtualizacaoPerfil,
  esquemaOnboarding,
  esquemaPerfil,
  esquemaRegistroDispositivo,
  type Onboarding,
  type Perfil,
} from '@mony/shared/usuario';
import { createZodDto } from 'nestjs-zod';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { UsuariosService } from './usuarios.service';

class PerfilDto extends createZodDto(esquemaPerfil) {}
class AtualizacaoPerfilDto extends createZodDto(esquemaAtualizacaoPerfil) {}
class RegistroDispositivoDto extends createZodDto(esquemaRegistroDispositivo) {}
class OnboardingDto extends createZodDto(esquemaOnboarding) {}
class AtualizacaoOnboardingDto extends createZodDto(esquemaAtualizacaoOnboarding) {}

/** Rotas do usuário logado (docs/arquitetura/05). */
@ApiTags('usuario')
@ApiBearerAuth()
@Controller('me')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

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
