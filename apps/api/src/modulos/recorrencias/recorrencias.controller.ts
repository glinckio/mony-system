import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  esquemaAtualizacaoRecorrencia,
  esquemaListaRecorrencias,
  esquemaNovaRecorrencia,
  esquemaRecorrencia,
  esquemaRespostaRecorrencia,
  type ListaRecorrencias,
  type Recorrencia,
  type RespostaRecorrencia,
} from '@mony/shared/recorrencias';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { RecorrenciasService } from './recorrencias.service';

class RecorrenciaDto extends createZodDto(esquemaRecorrencia) {}
class ListaRecorrenciasDto extends createZodDto(esquemaListaRecorrencias) {}
class NovaRecorrenciaDto extends createZodDto(esquemaNovaRecorrencia) {}
class AtualizacaoRecorrenciaDto extends createZodDto(esquemaAtualizacaoRecorrencia) {}
class RespostaRecorrenciaDto extends createZodDto(esquemaRespostaRecorrencia) {}

/** Rotas de recorrências (docs/arquitetura/05, RN-043). */
@ApiTags('recorrencias')
@ApiBearerAuth()
@Controller('recorrencias')
export class RecorrenciasController {
  constructor(private readonly recorrencias: RecorrenciasService) {}

  @Get()
  @ApiOkResponse({ type: ListaRecorrenciasDto, description: 'Recorrências ativas.' })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaRecorrencias> {
    return this.recorrencias.listar(contexto);
  }

  @Get(':id')
  @ApiOkResponse({ type: RecorrenciaDto })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Recorrencia> {
    return this.recorrencias.buscar(contexto, id);
  }

  @Post()
  @Idempotente()
  @ApiCreatedResponse({
    type: RespostaRecorrenciaDto,
    description: 'Recorrência criada e as ocorrências dos próximos 35 dias.',
  })
  criar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: NovaRecorrenciaDto,
  ): Promise<RespostaRecorrencia> {
    return this.recorrencias.criar(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({
    type: RespostaRecorrenciaDto,
    description: 'Recorrência atualizada e as ocorrências geradas agora, se houver.',
  })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoRecorrenciaDto,
  ): Promise<RespostaRecorrencia> {
    return this.recorrencias.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Recorrência parada; ocorrências pendentes de hoje em diante excluídas.',
  })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.recorrencias.excluir(contexto, id);
  }
}
