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
  type AlarmesLembretes,
  esquemaAdiamentoLembrete,
  esquemaAlarmesLembretes,
  esquemaAtualizacaoLembrete,
  esquemaConclusaoLembrete,
  esquemaConsultaLembretes,
  esquemaLembrete,
  esquemaListaLembretes,
  esquemaNovoLembrete,
  type Lembrete,
  type ListaLembretes,
} from '@mony/shared/lembretes';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { criarDto } from '../../core/openapi/dto';
import { RecursoLimitado } from '../planos/recurso-limitado.decorator';
import { LembretesService } from './lembretes.service';

class LembreteDto extends criarDto(esquemaLembrete) {}
class ListaLembretesDto extends criarDto(esquemaListaLembretes) {}
class ConsultaLembretesDto extends criarDto(esquemaConsultaLembretes) {}
class NovoLembreteDto extends criarDto(esquemaNovoLembrete) {}
class AtualizacaoLembreteDto extends criarDto(esquemaAtualizacaoLembrete) {}
class ConclusaoLembreteDto extends criarDto(esquemaConclusaoLembrete) {}
class AdiamentoLembreteDto extends criarDto(esquemaAdiamentoLembrete) {}
class AlarmesLembretesDto extends criarDto(esquemaAlarmesLembretes) {}

/** Rotas de lembretes (doc 05; RN-075 a RN-077). */
@ApiTags('lembretes')
@ApiBearerAuth()
@Controller('lembretes')
export class LembretesController {
  constructor(private readonly lembretes: LembretesService) {}

  @Get()
  @ApiOkResponse({
    type: ListaLembretesDto,
    description:
      'Os ativos (os que tocaram e esperam o [Feito] primeiro, depois o mais próximo) ou os feitos.',
  })
  listar(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaLembretesDto,
  ): Promise<ListaLembretes> {
    return this.lembretes.listar(contexto, consulta);
  }

  @Get('alarmes')
  @ApiOkResponse({
    type: AlarmesLembretesDto,
    description: 'Os 50 próximos alarmes (35 dias), para o aparelho agendar.',
  })
  alarmes(@ContextoAtual() contexto: Contexto): Promise<AlarmesLembretes> {
    return this.lembretes.alarmes(contexto);
  }

  @Get(':id')
  @ApiOkResponse({ type: LembreteDto })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Lembrete> {
    return this.lembretes.buscar(contexto, id);
  }

  @Post()
  @Idempotente()
  @RecursoLimitado('lembrete_ativo')
  @ApiCreatedResponse({ type: LembreteDto })
  criar(@ContextoAtual() contexto: Contexto, @Body() dados: NovoLembreteDto): Promise<Lembrete> {
    return this.lembretes.criar(contexto, dados);
  }

  @Patch(':id')
  @RecursoLimitado('lembrete_ativo')
  @ApiOkResponse({ type: LembreteDto, description: 'Uma data nova reativa o lembrete feito.' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoLembreteDto,
  ): Promise<Lembrete> {
    return this.lembretes.atualizar(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Lembrete excluído (sai das listas e dos alarmes).' })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.lembretes.excluir(contexto, id);
  }

  @Post(':id/concluir')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LembreteDto, description: 'O [Feito] (RN-076).' })
  concluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: ConclusaoLembreteDto,
  ): Promise<Lembrete> {
    return this.lembretes.concluir(contexto, id, dados);
  }

  @Post(':id/adiar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LembreteDto, description: 'A soneca: 10 min, 1 h ou amanhã (RN-076).' })
  adiar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AdiamentoLembreteDto,
  ): Promise<Lembrete> {
    return this.lembretes.adiar(contexto, id, dados);
  }
}
