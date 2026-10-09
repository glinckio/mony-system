import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  esquemaCadastro,
  esquemaLogin,
  esquemaRenovacao,
  esquemaSessao,
  type Sessao,
} from '@mony/shared/autenticacao';
import { createZodDto } from 'nestjs-zod';

import { Publico } from '../../core/auth/publico.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { AutenticacaoService } from './autenticacao.service';

class CadastroDto extends createZodDto(esquemaCadastro) {}
class LoginDto extends createZodDto(esquemaLogin) {}
class RenovacaoDto extends createZodDto(esquemaRenovacao) {}
class SessaoDto extends createZodDto(esquemaSessao) {}

/** Rotas de autenticação (docs/arquitetura/05). Só fazem HTTP; a regra está no Service. */
@ApiTags('autenticacao')
@Controller('auth')
export class AutenticacaoController {
  constructor(private readonly autenticacao: AutenticacaoService) {}

  @Publico()
  @Post('cadastro')
  @ApiCreatedResponse({ type: SessaoDto, description: 'Conta criada e sessão aberta.' })
  cadastrar(@Body() dados: CadastroDto, @Ip() ip: string): Promise<Sessao> {
    return this.autenticacao.cadastrar(dados, ip);
  }

  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SessaoDto, description: 'Sessão aberta neste aparelho.' })
  entrar(@Body() dados: LoginDto, @Ip() ip: string): Promise<Sessao> {
    return this.autenticacao.entrar(dados, ip);
  }

  @Publico()
  @Post('renovar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: SessaoDto, description: 'Novo par de tokens; o anterior deixa de valer.' })
  renovar(@Body() dados: RenovacaoDto): Promise<Sessao> {
    return this.autenticacao.renovar(dados.renovacao);
  }

  @Publico()
  @Post('sair')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Sessão deste aparelho encerrada.' })
  sair(@Body() dados: RenovacaoDto): Promise<void> {
    return this.autenticacao.sair(dados.renovacao);
  }

  @Post('sair-todos')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Todas as sessões do usuário encerradas.' })
  sairDeTodos(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<void> {
    return this.autenticacao.sairDeTodos(usuario);
  }
}
