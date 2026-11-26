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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  esquemaAtualizacaoTipoLista,
  esquemaExclusaoTipoLista,
  esquemaListaTiposLista,
  esquemaNovoTipoLista,
  esquemaTipoLista,
  type ListaTiposLista,
  type TipoLista,
} from '@mony/shared/listas';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { TiposListaService } from './tipos-lista.service';

class TipoListaDto extends criarDto(esquemaTipoLista) {}
class ListaTiposListaDto extends criarDto(esquemaListaTiposLista) {}
class NovoTipoListaDto extends criarDto(esquemaNovoTipoLista) {}
class AtualizacaoTipoListaDto extends criarDto(esquemaAtualizacaoTipoLista) {}
class ExclusaoTipoListaDto extends criarDto(esquemaExclusaoTipoLista) {}

/** Rotas dos tipos de lista de compras (T-123d). */
@ApiTags('tipos-lista')
@ApiBearerAuth()
@Controller('tipos-lista')
export class TiposListaController {
  constructor(private readonly tipos: TiposListaService) {}

  @Get()
  @ApiOkResponse({ type: ListaTiposListaDto, description: 'Os tipos de lista do usuário.' })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaTiposLista> {
    return this.tipos.listar(contexto);
  }

  @Post()
  @ApiCreatedResponse({ type: TipoListaDto, description: 'Tipo de lista criado.' })
  criar(@ContextoAtual() contexto: Contexto, @Body() dados: NovoTipoListaDto): Promise<TipoLista> {
    return this.tipos.criar(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: TipoListaDto, description: 'Tipo de lista depois da mudança.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoTipoListaDto,
  ): Promise<TipoLista> {
    return this.tipos.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Tipo apagado; as listas dele vão para `mover_para` (obrigatório se houver).',
  })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() consulta: ExclusaoTipoListaDto,
  ): Promise<void> {
    return this.tipos.excluir(contexto, id, consulta.mover_para);
  }
}
