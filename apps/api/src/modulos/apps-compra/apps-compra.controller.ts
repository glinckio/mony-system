import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  esquemaAberturaAppCompra,
  esquemaAtualizacaoAppsMonitorados,
  esquemaListaAppsMonitorados,
  esquemaResultadoAberturaApp,
  esquemaTokenEvento,
  type ListaAppsMonitorados,
  type ResultadoAberturaApp,
  type TokenEvento,
} from '@mony/shared/apps-compra';

import { Publico } from '../../core/auth/publico.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { LiberadaParaVersaoAntiga } from '../../core/versao-app/versao-app';
import { AppsCompraService } from './apps-compra.service';

class ListaAppsMonitoradosDto extends criarDto(esquemaListaAppsMonitorados) {}
class AtualizacaoAppsMonitoradosDto extends criarDto(esquemaAtualizacaoAppsMonitorados) {}
class TokenEventoDto extends criarDto(esquemaTokenEvento) {}
class AberturaAppCompraDto extends criarDto(esquemaAberturaAppCompra) {}
class ResultadoAberturaAppDto extends criarDto(esquemaResultadoAberturaApp) {}

/** "Bearer <token>" → o token. */
const tokenDo = (cabecalho: string | undefined): string | undefined =>
  cabecalho?.startsWith('Bearer ') === true ? cabecalho.slice('Bearer '.length).trim() : undefined;

/** Apps de compra monitorados (doc 05, T-121a). */
@ApiTags('apps-compra')
@ApiBearerAuth()
@Controller('apps-monitorados')
export class AppsMonitoradosController {
  constructor(private readonly apps: AppsCompraService) {}

  @Get()
  @ApiOkResponse({
    type: ListaAppsMonitoradosDto,
    description: 'Os apps da lista e se o recurso está no plano (RN-121).',
  })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaAppsMonitorados> {
    return this.apps.listar(contexto);
  }

  @Put()
  @ApiOkResponse({ type: ListaAppsMonitoradosDto, description: 'A lista depois da troca.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: AtualizacaoAppsMonitoradosDto,
  ): Promise<ListaAppsMonitorados> {
    return this.apps.atualizar(contexto, dados);
  }

  @Post('token-evento')
  @ApiCreatedResponse({
    type: TokenEventoDto,
    description:
      'Liga o recurso neste aparelho: o token só para mandar as aberturas. Pedir de novo troca o token. No gratuito, RECURSO_EXIGE_PLANO_PAGO.',
  })
  emitirToken(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoAtual() contexto: Contexto,
  ): Promise<TokenEvento> {
    return this.apps.emitirToken(usuario, contexto);
  }

  @Delete('token-evento')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Desliga o recurso neste aparelho.' })
  revogarToken(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<void> {
    return this.apps.revogarToken(usuario);
  }
}

/**
 * A abertura que o aparelho manda (doc 10): o worker nativo do Android e a extensão do iOS, sem a
 * sessão do app, com o token de evento no `Authorization`.
 */
@ApiTags('apps-compra')
@Controller('eventos')
export class EventosAppsController {
  constructor(private readonly apps: AppsCompraService) {}

  @Post('app-compra-aberto')
  @Publico()
  @LiberadaParaVersaoAntiga()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({
    type: ResultadoAberturaAppDto,
    description:
      'Se o alerta saiu (RN-104: um por app no intervalo do painel) ou por que não. Token que não vale, 401; sem plano pago, o token cai e a resposta é RECURSO_EXIGE_PLANO_PAGO.',
  })
  abertura(
    @Headers('authorization') cabecalho: string | undefined,
    @Body() dados: AberturaAppCompraDto,
  ): Promise<ResultadoAberturaApp> {
    return this.apps.registrarAbertura(tokenDo(cabecalho), dados);
  }
}
