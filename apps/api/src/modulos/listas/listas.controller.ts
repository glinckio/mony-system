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
  type DetalheLista,
  esquemaAtualizacaoItemLista,
  esquemaAtualizacaoLista,
  esquemaDetalheLista,
  esquemaFinalizacaoLista,
  esquemaListaListas,
  esquemaNovaLista,
  esquemaNovoItemLista,
  type ListaListas,
} from '@mony/shared/listas';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { criarDto } from '../../core/openapi/dto';
import { RecursoLimitado } from '../planos/recurso-limitado.decorator';
import { ListasService } from './listas.service';

class ListaListasDto extends criarDto(esquemaListaListas) {}
class DetalheListaDto extends criarDto(esquemaDetalheLista) {}
class NovaListaDto extends criarDto(esquemaNovaLista) {}
class AtualizacaoListaDto extends criarDto(esquemaAtualizacaoLista) {}
class NovoItemListaDto extends criarDto(esquemaNovoItemLista) {}
class AtualizacaoItemListaDto extends criarDto(esquemaAtualizacaoItemLista) {}
class FinalizacaoListaDto extends criarDto(esquemaFinalizacaoLista) {}

/** Rotas de listas de compras (doc 05; RN-070 a RN-073). */
@ApiTags('listas')
@ApiBearerAuth()
@Controller('listas')
export class ListasController {
  constructor(private readonly listas: ListasService) {}

  @Get()
  @ApiOkResponse({
    type: ListaListasDto,
    description: 'As abertas (a mais nova primeiro) e as últimas 20 finalizadas.',
  })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaListas> {
    return this.listas.listar(contexto);
  }

  @Get(':id')
  @ApiOkResponse({
    type: DetalheListaDto,
    description: 'A lista com os itens, o histórico de preço e o orçamento livre da categoria.',
  })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DetalheLista> {
    return this.listas.buscar(contexto, id);
  }

  @Post()
  @RecursoLimitado('lista_compras')
  @ApiCreatedResponse({ type: DetalheListaDto })
  criar(@ContextoAtual() contexto: Contexto, @Body() dados: NovaListaDto): Promise<DetalheLista> {
    return this.listas.criar(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: DetalheListaDto })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoListaDto,
  ): Promise<DetalheLista> {
    return this.listas.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Lista e itens apagados; a despesa gerada continua.' })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.listas.excluir(contexto, id);
  }

  @Post(':id/itens')
  @ApiCreatedResponse({
    type: DetalheListaDto,
    description: 'A lista com o item novo; sem preço, o sugerido pelo histórico de NFC-e.',
  })
  adicionarItem(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: NovoItemListaDto,
  ): Promise<DetalheLista> {
    return this.listas.adicionarItem(contexto, id, dados);
  }

  @Post(':id/finalizar')
  @Idempotente()
  @RecursoLimitado('lancamento')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: DetalheListaDto,
    description: 'Lança uma despesa com o total dos comprados e fecha a lista (RN-072).',
  })
  finalizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: FinalizacaoListaDto,
  ): Promise<DetalheLista> {
    return this.listas.finalizar(contexto, id, dados);
  }
}

/** Rotas dos itens das listas (doc 05). */
@ApiTags('listas')
@ApiBearerAuth()
@Controller('itens')
export class ItensListaController {
  constructor(private readonly listas: ListasService) {}

  @Patch(':id')
  @ApiOkResponse({ type: DetalheListaDto, description: 'A lista com o item mudado.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoItemListaDto,
  ): Promise<DetalheLista> {
    return this.listas.atualizarItem(contexto, id, dados);
  }

  @Delete(':id')
  @ApiOkResponse({ type: DetalheListaDto, description: 'A lista sem o item.' })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DetalheLista> {
    return this.listas.excluirItem(contexto, id);
  }
}
