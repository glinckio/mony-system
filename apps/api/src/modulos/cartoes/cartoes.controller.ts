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
  type Cartao,
  type DetalheFatura,
  esquemaAtualizacaoCartao,
  esquemaCartao,
  esquemaDetalheFatura,
  esquemaListaCartoes,
  esquemaListaFaturas,
  esquemaNovoCartao,
  esquemaPagamentoFatura,
  esquemaRespostaPagamentoFatura,
  type ListaCartoes,
  type ListaFaturas,
  type RespostaPagamentoFatura,
} from '@mony/shared/cartoes';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { CartoesService } from './cartoes.service';

class CartaoDto extends createZodDto(esquemaCartao) {}
class ListaCartoesDto extends createZodDto(esquemaListaCartoes) {}
class NovoCartaoDto extends createZodDto(esquemaNovoCartao) {}
class AtualizacaoCartaoDto extends createZodDto(esquemaAtualizacaoCartao) {}
class ListaFaturasDto extends createZodDto(esquemaListaFaturas) {}
class DetalheFaturaDto extends createZodDto(esquemaDetalheFatura) {}
class PagamentoFaturaDto extends createZodDto(esquemaPagamentoFatura) {}
class RespostaPagamentoFaturaDto extends createZodDto(esquemaRespostaPagamentoFatura) {}

/** Rotas de cartões (doc 05). A compra no cartão entra por `POST /transacoes`. */
@ApiTags('cartoes')
@ApiBearerAuth()
@Controller('cartoes')
export class CartoesController {
  constructor(private readonly cartoes: CartoesService) {}

  @Get()
  @ApiOkResponse({
    type: ListaCartoesDto,
    description: 'Cartões do usuário, com o limite usado e a fatura atual (RN-034).',
  })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaCartoes> {
    return this.cartoes.listar(contexto);
  }

  @Get(':id')
  @ApiOkResponse({ type: CartaoDto })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Cartao> {
    return this.cartoes.buscar(contexto, id);
  }

  @Post()
  @ApiCreatedResponse({ type: CartaoDto, description: 'Cartão criado (RN-030).' })
  criar(@ContextoAtual() contexto: Contexto, @Body() dados: NovoCartaoDto): Promise<Cartao> {
    return this.cartoes.criar(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CartaoDto, description: 'Cartão depois da mudança.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoCartaoDto,
  ): Promise<Cartao> {
    return this.cartoes.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Cartão excluído (exclusão lógica). Com fatura em aberto, 409.',
  })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.cartoes.excluir(contexto, id);
  }

  @Get(':id/faturas')
  @ApiOkResponse({
    type: ListaFaturasDto,
    description: 'Faturas do cartão, da mais nova para a mais antiga (RN-033).',
  })
  faturas(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ListaFaturas> {
    return this.cartoes.faturas(contexto, id);
  }
}

/** Rotas de fatura (doc 05): detalhe e pagamento. */
@ApiTags('cartoes')
@ApiBearerAuth()
@Controller('faturas')
export class FaturasController {
  constructor(private readonly cartoes: CartoesService) {}

  @Get(':id')
  @ApiOkResponse({ type: DetalheFaturaDto, description: 'A fatura, as compras e os pagamentos.' })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DetalheFatura> {
    return this.cartoes.fatura(contexto, id);
  }

  @Post(':id/pagar')
  @Idempotente()
  @ApiCreatedResponse({
    type: RespostaPagamentoFaturaDto,
    description:
      'Pagamento total ou parcial (RN-036), gravado como transação `pagamento_fatura` (RN-037).',
  })
  pagar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: PagamentoFaturaDto,
  ): Promise<RespostaPagamentoFatura> {
    return this.cartoes.pagar(contexto, id, dados);
  }
}
