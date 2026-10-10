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
  esquemaAtualizacaoTransacao,
  esquemaConsultaTransacoes,
  esquemaFiltroTransacoes,
  esquemaLoteTransacoes,
  esquemaNovaTransacao,
  esquemaPaginaTransacoes,
  esquemaRespostaTransacao,
  esquemaResultadoLote,
  esquemaTotaisTransacoes,
  esquemaTransacao,
  type PaginaTransacoes,
  type RespostaTransacao,
  type ResultadoLote,
  type TotaisTransacoes,
  type Transacao,
} from '@mony/shared/transacoes';
import { esquemaExclusaoTransacao } from '@mony/shared/recorrencias';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { TransacoesService } from './transacoes.service';

class TransacaoDto extends createZodDto(esquemaTransacao) {}
class RespostaTransacaoDto extends createZodDto(esquemaRespostaTransacao) {}
class NovaTransacaoDto extends createZodDto(esquemaNovaTransacao) {}
class AtualizacaoTransacaoDto extends createZodDto(esquemaAtualizacaoTransacao) {}
class FiltroTransacoesDto extends createZodDto(esquemaFiltroTransacoes) {}
class ConsultaTransacoesDto extends createZodDto(esquemaConsultaTransacoes) {}
class PaginaTransacoesDto extends createZodDto(esquemaPaginaTransacoes) {}
class TotaisTransacoesDto extends createZodDto(esquemaTotaisTransacoes) {}
class LoteTransacoesDto extends createZodDto(esquemaLoteTransacoes) {}
class ResultadoLoteDto extends createZodDto(esquemaResultadoLote) {}
class ExclusaoTransacaoDto extends createZodDto(esquemaExclusaoTransacao) {}

/** Rotas de transações (docs/arquitetura/05). */
@ApiTags('transacoes')
@ApiBearerAuth()
@Controller('transacoes')
export class TransacoesController {
  constructor(private readonly transacoes: TransacoesService) {}

  @Get()
  @ApiOkResponse({ type: PaginaTransacoesDto, description: 'Lançamentos do filtro (RN-047).' })
  listar(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaTransacoesDto,
  ): Promise<PaginaTransacoes> {
    return this.transacoes.listar(contexto, consulta);
  }

  @Get('totais')
  @ApiOkResponse({ type: TotaisTransacoesDto, description: 'Totais do filtro (RN-047).' })
  totais(
    @ContextoAtual() contexto: Contexto,
    @Query() filtro: FiltroTransacoesDto,
  ): Promise<TotaisTransacoes> {
    return this.transacoes.totais(contexto, filtro);
  }

  @Get(':id')
  @ApiOkResponse({ type: TransacaoDto })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Transacao> {
    return this.transacoes.buscar(contexto, id);
  }

  @Post()
  @Idempotente()
  @ApiCreatedResponse({
    type: RespostaTransacaoDto,
    description: 'Lançamento gravado e o impacto dele no orçamento e no cartão.',
  })
  registrar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: NovaTransacaoDto,
  ): Promise<RespostaTransacao> {
    return this.transacoes.registrar(contexto, dados);
  }

  @Post('lote')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResultadoLoteDto, description: 'Quantos lançamentos mudaram (RN-044).' })
  lote(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: LoteTransacoesDto,
  ): Promise<ResultadoLote> {
    return this.transacoes.lote(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: RespostaTransacaoDto })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoTransacaoDto,
  ): Promise<RespostaTransacao> {
    return this.transacoes.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'Lançamento excluído (exclusão lógica, RN-046). Em ocorrência de recorrência, `recorrencia` escolhe só esta, esta e as próximas, ou todas (RN-043).',
  })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() consulta: ExclusaoTransacaoDto,
  ): Promise<void> {
    return this.transacoes.excluir(contexto, id, consulta.recorrencia);
  }
}
