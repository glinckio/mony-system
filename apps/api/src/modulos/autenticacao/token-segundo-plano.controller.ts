import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { esquemaTokenSegundoPlano, type TokenSegundoPlano } from '@mony/shared/autenticacao';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { TokenSegundoPlanoService } from './token-segundo-plano.service';

class TokenSegundoPlanoDto extends criarDto(esquemaTokenSegundoPlano) {}

/**
 * `POST /me/token-segundo-plano` (T-088b). Fica no módulo de autenticação, e não no de usuários:
 * o worker carrega o de usuários e não tem os tokens de acesso.
 */
@ApiTags('usuario')
@ApiBearerAuth()
@Controller('me')
export class TokenSegundoPlanoController {
  constructor(private readonly segundoPlano: TokenSegundoPlanoService) {}

  @Post('token-segundo-plano')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: TokenSegundoPlanoDto,
    description:
      'Token do aparelho para a tarefa que trata o push com o app fechado (T-088b): vale só nas rotas do push, até 30 dias e nunca além da sessão. Só com o token do app.',
  })
  emitir(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<TokenSegundoPlano> {
    return this.segundoPlano.emitir(usuario);
  }
}
