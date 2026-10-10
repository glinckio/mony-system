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
  type Conta,
  esquemaAtualizacaoConta,
  esquemaConta,
  esquemaListaContas,
  esquemaNovaConta,
  type ListaContas,
} from '@mony/shared/contas';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { ContasService } from './contas.service';

class ContaDto extends createZodDto(esquemaConta) {}
class ListaContasDto extends createZodDto(esquemaListaContas) {}
class NovaContaDto extends createZodDto(esquemaNovaConta) {}
class AtualizacaoContaDto extends createZodDto(esquemaAtualizacaoConta) {}

/** Rotas de contas (proposta do doc 05). */
@ApiTags('contas')
@ApiBearerAuth()
@Controller('contas')
export class ContasController {
  constructor(private readonly contas: ContasService) {}

  @Get()
  @ApiOkResponse({ type: ListaContasDto, description: 'Contas do usuário, com o saldo atual.' })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaContas> {
    return this.contas.listar(contexto);
  }

  @Post()
  @ApiCreatedResponse({ type: ContaDto, description: 'Conta criada.' })
  criar(@ContextoAtual() contexto: Contexto, @Body() dados: NovaContaDto): Promise<Conta> {
    return this.contas.criar(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ContaDto, description: 'Conta depois da mudança.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoContaDto,
  ): Promise<Conta> {
    return this.contas.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Conta excluída; os lançamentos ficam sem conta.' })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.contas.excluir(contexto, id);
  }
}
