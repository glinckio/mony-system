import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaConsultaOrcamentos,
  esquemaDefinicaoOrcamento,
  esquemaListaOrcamentos,
  esquemaOrcamento,
  type ListaOrcamentos,
  type Orcamento,
} from '@mony/shared/orcamentos';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { OrcamentosService } from './orcamentos.service';

class OrcamentoDto extends createZodDto(esquemaOrcamento) {}
class ListaOrcamentosDto extends createZodDto(esquemaListaOrcamentos) {}
class ConsultaOrcamentosDto extends createZodDto(esquemaConsultaOrcamentos) {}
class DefinicaoOrcamentoDto extends createZodDto(esquemaDefinicaoOrcamento) {}

/** Rotas de orçamentos (doc 05; RN-060 a RN-062). */
@ApiTags('orcamentos')
@ApiBearerAuth()
@Controller('orcamentos')
export class OrcamentosController {
  constructor(private readonly orcamentos: OrcamentosService) {}

  @Get()
  @ApiOkResponse({
    type: ListaOrcamentosDto,
    description: 'Orçamentos da competência, com gasto, faixa e projeção (RN-061, RN-062).',
  })
  listar(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaOrcamentosDto,
  ): Promise<ListaOrcamentos> {
    return this.orcamentos.listar(contexto, consulta.competencia);
  }

  @Put()
  @ApiOkResponse({ type: OrcamentoDto, description: 'Orçamento criado ou mudado (RN-060).' })
  definir(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: DefinicaoOrcamentoDto,
  ): Promise<Orcamento> {
    return this.orcamentos.definir(contexto, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Orçamento tirado; os meses seguintes não o recebem.' })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.orcamentos.excluir(contexto, id);
  }
}
