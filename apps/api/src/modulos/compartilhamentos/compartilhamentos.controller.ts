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
  type Compartilhamento,
  esquemaAtualizacaoCompartilhamento,
  esquemaCompartilhamento,
  esquemaListaCompartilhamentos,
  esquemaNovoCompartilhamento,
  type ListaCompartilhamentos,
} from '@mony/shared/compartilhamentos';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { CompartilhamentosService } from './compartilhamentos.service';

class CompartilhamentoDto extends criarDto(esquemaCompartilhamento) {}
class ListaCompartilhamentosDto extends criarDto(esquemaListaCompartilhamentos) {}
class NovoCompartilhamentoDto extends criarDto(esquemaNovoCompartilhamento) {}
class AtualizacaoCompartilhamentoDto extends criarDto(esquemaAtualizacaoCompartilhamento) {}

/** Rotas de compartilhamento (doc 05; RN-074): convites das listas de compras. */
@ApiTags('compartilhamentos')
@ApiBearerAuth()
@Controller('compartilhamentos')
export class CompartilhamentosController {
  constructor(private readonly compartilhamentos: CompartilhamentosService) {}

  @Get()
  @ApiOkResponse({
    type: ListaCompartilhamentosDto,
    description: 'Convites recebidos (pendentes e aceitos) e enviados, os mais novos primeiro.',
  })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaCompartilhamentos> {
    return this.compartilhamentos.listar(contexto);
  }

  @Post()
  @ApiCreatedResponse({
    type: CompartilhamentoDto,
    description: 'Convite para quem tem conta (e-mail ou telefone); de novo, volta a pendente.',
  })
  convidar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: NovoCompartilhamentoDto,
  ): Promise<Compartilhamento> {
    return this.compartilhamentos.convidar(contexto, dados);
  }

  @Post(':id/aceitar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CompartilhamentoDto })
  aceitar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Compartilhamento> {
    return this.compartilhamentos.aceitar(contexto, id);
  }

  @Post(':id/recusar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CompartilhamentoDto })
  recusar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Compartilhamento> {
    return this.compartilhamentos.recusar(contexto, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CompartilhamentoDto, description: 'O dono muda a permissão.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoCompartilhamentoDto,
  ): Promise<Compartilhamento> {
    return this.compartilhamentos.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'O dono tira a pessoa, ou a pessoa sai da lista.' })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.compartilhamentos.excluir(contexto, id);
  }
}
