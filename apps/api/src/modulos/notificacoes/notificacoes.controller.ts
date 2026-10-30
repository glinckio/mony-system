import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaAtualizacaoPreferenciasAlerta,
  esquemaConsultaNotificacoes,
  esquemaNotificacao,
  esquemaPaginaNotificacoes,
  esquemaPreferenciasAlerta,
  type Notificacao,
  type PaginaNotificacoes,
  type PreferenciasAlerta,
} from '@mony/shared/notificacoes';
import { esquemaResultadoLote, type ResultadoLote } from '@mony/shared/transacoes';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { SegundoPlano } from '../../core/auth/segundo-plano.decorator';
import { NotificacoesService } from './notificacoes.service';

class NotificacaoDto extends criarDto(esquemaNotificacao) {}
class PaginaNotificacoesDto extends criarDto(esquemaPaginaNotificacoes) {}
class ConsultaNotificacoesDto extends criarDto(esquemaConsultaNotificacoes) {}
class PreferenciasAlertaDto extends criarDto(esquemaPreferenciasAlerta) {}
class AtualizacaoPreferenciasAlertaDto extends criarDto(esquemaAtualizacaoPreferenciasAlerta) {}
class ResultadoLoteDto extends criarDto(esquemaResultadoLote) {}

/** Central de notificações (doc 09). */
@ApiTags('notificacoes')
@ApiBearerAuth()
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @Get()
  @ApiOkResponse({ type: PaginaNotificacoesDto, description: 'Da mais nova para a mais antiga.' })
  listar(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaNotificacoesDto,
  ): Promise<PaginaNotificacoes> {
    return this.notificacoes.listar(contexto, consulta);
  }

  @Post('lidas')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResultadoLoteDto, description: 'Marca todas como lidas.' })
  marcarTodas(@ContextoAtual() contexto: Contexto): Promise<ResultadoLote> {
    return this.notificacoes.marcarTodasLidas(contexto);
  }

  @Post(':id/lida')
  @SegundoPlano()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: NotificacaoDto })
  marcarLida(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Notificacao> {
    return this.notificacoes.marcarLida(contexto, id);
  }
}

/** Preferências de alerta e horário de silêncio (RN-100, RN-101, RN-108). */
@ApiTags('notificacoes')
@ApiBearerAuth()
@Controller('preferencias-alerta')
export class PreferenciasAlertaController {
  constructor(private readonly notificacoes: NotificacoesService) {}

  @Get()
  @ApiOkResponse({ type: PreferenciasAlertaDto })
  obter(@ContextoAtual() contexto: Contexto): Promise<PreferenciasAlerta> {
    return this.notificacoes.preferencias(contexto);
  }

  @Put()
  @ApiOkResponse({ type: PreferenciasAlertaDto, description: 'Só o que veio muda.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: AtualizacaoPreferenciasAlertaDto,
  ): Promise<PreferenciasAlerta> {
    return this.notificacoes.atualizarPreferencias(contexto, dados);
  }
}
