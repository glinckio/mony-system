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
  type DetalheParcelamento,
  esquemaAtualizacaoParcelamento,
  esquemaDetalheParcelamento,
  esquemaFiltroParcelamentos,
  esquemaListaParcelamentos,
  esquemaNovoParcelamento,
  esquemaPagamentoParcela,
  esquemaRespostaParcela,
  esquemaRespostaParcelamento,
  esquemaResultadoSimulacao,
  esquemaSimulacaoParcelamento,
  type ListaParcelamentos,
  type RespostaParcela,
  type RespostaParcelamento,
  type ResultadoSimulacao,
} from '@mony/shared/parcelamentos';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { ParcelamentosService } from './parcelamentos.service';

class ListaParcelamentosDto extends createZodDto(esquemaListaParcelamentos) {}
class FiltroParcelamentosDto extends createZodDto(esquemaFiltroParcelamentos) {}
class DetalheParcelamentoDto extends createZodDto(esquemaDetalheParcelamento) {}
class NovoParcelamentoDto extends createZodDto(esquemaNovoParcelamento) {}
class RespostaParcelamentoDto extends createZodDto(esquemaRespostaParcelamento) {}
class AtualizacaoParcelamentoDto extends createZodDto(esquemaAtualizacaoParcelamento) {}
class SimulacaoParcelamentoDto extends createZodDto(esquemaSimulacaoParcelamento) {}
class ResultadoSimulacaoDto extends createZodDto(esquemaResultadoSimulacao) {}
class PagamentoParcelaDto extends createZodDto(esquemaPagamentoParcela) {}
class RespostaParcelaDto extends createZodDto(esquemaRespostaParcela) {}

/** Rotas de parcelamentos e dívidas (doc 05; RN-050 a RN-055). */
@ApiTags('parcelamentos')
@ApiBearerAuth()
@Controller('parcelamentos')
export class ParcelamentosController {
  constructor(private readonly parcelamentos: ParcelamentosService) {}

  @Get()
  @ApiOkResponse({ type: ListaParcelamentosDto, description: 'Com status e progresso (RN-055).' })
  listar(
    @ContextoAtual() contexto: Contexto,
    @Query() filtro: FiltroParcelamentosDto,
  ): Promise<ListaParcelamentos> {
    return this.parcelamentos.listar(contexto, filtro);
  }

  @Post('simular')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResultadoSimulacaoDto, description: 'Tabela sem gravar (RN-052).' })
  simular(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: SimulacaoParcelamentoDto,
  ): Promise<ResultadoSimulacao> {
    return this.parcelamentos.simular(contexto, dados);
  }

  @Get(':id')
  @ApiOkResponse({ type: DetalheParcelamentoDto, description: 'O parcelamento e as parcelas.' })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DetalheParcelamento> {
    return this.parcelamentos.buscar(contexto, id);
  }

  @Post()
  @Idempotente()
  @ApiCreatedResponse({
    type: RespostaParcelamentoDto,
    description: 'Parcelamento com as parcelas e as despesas pendentes delas (RN-050, RN-051).',
  })
  registrar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: NovoParcelamentoDto,
  ): Promise<RespostaParcelamento> {
    return this.parcelamentos.registrar(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: DetalheParcelamentoDto })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoParcelamentoDto,
  ): Promise<DetalheParcelamento> {
    return this.parcelamentos.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Cancela (RN-054): as parcelas futuras não pagas saem; as vencidas ficam.',
  })
  cancelar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.parcelamentos.cancelar(contexto, id);
  }
}

/** Pagar e desfazer parcela de dívida (RN-053). Parcela de cartão é paga pela fatura. */
@ApiTags('parcelamentos')
@ApiBearerAuth()
@Controller('parcelas')
export class ParcelasController {
  constructor(private readonly parcelamentos: ParcelamentosService) {}

  @Post(':id/pagar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RespostaParcelaDto })
  pagar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: PagamentoParcelaDto,
  ): Promise<RespostaParcela> {
    return this.parcelamentos.pagarParcela(contexto, id, dados);
  }

  @Post(':id/desfazer')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: RespostaParcelaDto })
  desfazer(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RespostaParcela> {
    return this.parcelamentos.desfazerParcela(contexto, id);
  }
}
