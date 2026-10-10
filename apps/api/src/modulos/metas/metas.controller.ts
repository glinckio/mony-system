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
  type DetalheMeta,
  esquemaAtualizacaoMeta,
  esquemaDetalheMeta,
  esquemaListaMetas,
  esquemaMeta,
  esquemaNovaMeta,
  esquemaNovoAporte,
  esquemaRespostaAporte,
  type ListaMetas,
  type Meta,
  type RespostaAporte,
} from '@mony/shared/metas';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { MetasService } from './metas.service';

class MetaDto extends createZodDto(esquemaMeta) {}
class DetalheMetaDto extends createZodDto(esquemaDetalheMeta) {}
class ListaMetasDto extends createZodDto(esquemaListaMetas) {}
class NovaMetaDto extends createZodDto(esquemaNovaMeta) {}
class AtualizacaoMetaDto extends createZodDto(esquemaAtualizacaoMeta) {}
class NovoAporteDto extends createZodDto(esquemaNovoAporte) {}
class RespostaAporteDto extends createZodDto(esquemaRespostaAporte) {}

/** Rotas de metas de economia (doc 05; RN-063). */
@ApiTags('metas')
@ApiBearerAuth()
@Controller('metas')
export class MetasController {
  constructor(private readonly metas: MetasService) {}

  @Get()
  @ApiOkResponse({ type: ListaMetasDto, description: 'Abertas primeiro, pelo prazo.' })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaMetas> {
    return this.metas.listar(contexto);
  }

  @Get(':id')
  @ApiOkResponse({ type: DetalheMetaDto, description: 'A meta e os aportes.' })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DetalheMeta> {
    return this.metas.buscar(contexto, id);
  }

  @Post()
  @ApiCreatedResponse({ type: MetaDto })
  criar(@ContextoAtual() contexto: Contexto, @Body() dados: NovaMetaDto): Promise<Meta> {
    return this.metas.criar(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: MetaDto })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoMetaDto,
  ): Promise<Meta> {
    return this.metas.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Meta e aportes apagados.' })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.metas.excluir(contexto, id);
  }

  @Post(':id/aportes')
  @Idempotente()
  @ApiCreatedResponse({
    type: RespostaAporteDto,
    description: 'Aporte gravado; `sugerirConclusao` quando a meta chegou ao alvo (RN-063).',
  })
  aportar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: NovoAporteDto,
  ): Promise<RespostaAporte> {
    return this.metas.aportar(contexto, id, dados);
  }

  @Delete(':id/aportes/:aporteId')
  @ApiOkResponse({ type: MetaDto, description: 'Aporte tirado; a meta com o valor refeito.' })
  excluirAporte(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aporteId', ParseUUIDPipe) aporteId: string,
  ): Promise<Meta> {
    return this.metas.excluirAporte(contexto, id, aporteId);
  }
}
