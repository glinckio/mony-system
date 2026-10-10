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
  type Categoria,
  esquemaAtualizacaoCategoria,
  esquemaCategoria,
  esquemaExclusaoCategoria,
  esquemaFiltroCategorias,
  esquemaListaCategorias,
  esquemaNovaCategoria,
  type ListaCategorias,
} from '@mony/shared/categorias';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { CategoriasService } from './categorias.service';

class CategoriaDto extends createZodDto(esquemaCategoria) {}
class ListaCategoriasDto extends createZodDto(esquemaListaCategorias) {}
class FiltroCategoriasDto extends createZodDto(esquemaFiltroCategorias) {}
class NovaCategoriaDto extends createZodDto(esquemaNovaCategoria) {}
class AtualizacaoCategoriaDto extends createZodDto(esquemaAtualizacaoCategoria) {}
class ExclusaoCategoriaDto extends createZodDto(esquemaExclusaoCategoria) {}

/** Rotas de categorias (docs/arquitetura/05). */
@ApiTags('categorias')
@ApiBearerAuth()
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  @Get()
  @ApiOkResponse({
    type: ListaCategoriasDto,
    description: 'Categorias do usuário, por tipo e nome.',
  })
  listar(
    @ContextoAtual() contexto: Contexto,
    @Query() filtro: FiltroCategoriasDto,
  ): Promise<ListaCategorias> {
    return this.categorias.listar(contexto, filtro);
  }

  @Post()
  @ApiCreatedResponse({ type: CategoriaDto, description: 'Categoria criada (RN-065).' })
  criar(@ContextoAtual() contexto: Contexto, @Body() dados: NovaCategoriaDto): Promise<Categoria> {
    return this.categorias.criar(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CategoriaDto, description: 'Categoria depois da mudança.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoCategoriaDto,
  ): Promise<Categoria> {
    return this.categorias.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'Categoria excluída; lançamentos movidos para mover_para e orçamentos removidos (RN-066).',
  })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() consulta: ExclusaoCategoriaDto,
  ): Promise<void> {
    return this.categorias.excluir(contexto, id, consulta.mover_para);
  }
}
