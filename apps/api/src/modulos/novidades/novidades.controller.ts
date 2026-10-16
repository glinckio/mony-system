import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { esquemaNovidades, type Novidades } from '@mony/shared/notificacoes';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { NovidadesService } from './novidades.service';

class NovidadesDto extends criarDto(esquemaNovidades) {}

/** A aba Novidades da central (T-150, doc 13). */
@ApiTags('novidades')
@ApiBearerAuth()
@Controller('novidades')
export class NovidadesController {
  constructor(private readonly novidades: NovidadesService) {}

  @Get()
  @ApiOkResponse({
    type: NovidadesDto,
    description: 'As novidades no ar, da mais nova para a mais antiga, e quantas não foram lidas.',
  })
  listar(@ContextoAtual() contexto: Contexto): Promise<Novidades> {
    return this.novidades.listar(contexto);
  }

  @Post(':id/lida')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: '404 se a novidade não está no ar.' })
  marcarLida(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.novidades.marcarLida(contexto, id);
  }
}
