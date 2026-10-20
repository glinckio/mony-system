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
  Put,
  Query,
  Redirect,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AgendaDoPeriodo,
  type Compromisso,
  esquemaAgendaDoPeriodo,
  esquemaAgendaPadrao,
  esquemaAtualizacaoCompromisso,
  esquemaCompromisso,
  esquemaConsultaAgenda,
  esquemaLinkConexaoAgenda,
  esquemaListaAgendas,
  esquemaNovoCompromisso,
  esquemaPedidoConexaoAgenda,
  type LinkConexaoAgenda,
  type ListaAgendas,
} from '@mony/shared/agenda';

import { Publico } from '../../core/auth/publico.decorator';
import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { criarDto } from '../../core/openapi/dto';
import { LiberadaParaVersaoAntiga } from '../../core/versao-app/versao-app';
import { AgendaService } from './agenda.service';

class PedidoConexaoAgendaDto extends criarDto(esquemaPedidoConexaoAgenda) {}
class LinkConexaoAgendaDto extends criarDto(esquemaLinkConexaoAgenda) {}
class ListaAgendasDto extends criarDto(esquemaListaAgendas) {}
class AgendaPadraoDto extends criarDto(esquemaAgendaPadrao) {}
class ConsultaAgendaDto extends criarDto(esquemaConsultaAgenda) {}
class AgendaDoPeriodoDto extends criarDto(esquemaAgendaDoPeriodo) {}
class CompromissoDto extends criarDto(esquemaCompromisso) {}
class NovoCompromissoDto extends criarDto(esquemaNovoCompromisso) {}
class AtualizacaoCompromissoDto extends criarDto(esquemaAtualizacaoCompromisso) {}

/** Agendas conectadas (doc 05, T-085a): Google e Outlook por OAuth no servidor. */
@ApiTags('agenda')
@ApiBearerAuth()
@Controller('agendas')
export class AgendasController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  @ApiOkResponse({ type: ListaAgendasDto, description: 'As agendas conectadas e qual é a padrão.' })
  listar(@ContextoAtual() contexto: Contexto): Promise<ListaAgendas> {
    return this.agenda.listarAgendas(contexto);
  }

  @Post('conectar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: LinkConexaoAgendaDto,
    description: 'O consentimento no provedor, para abrir no navegador; volta em mony://agenda.',
  })
  conectar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: PedidoConexaoAgendaDto,
  ): LinkConexaoAgenda {
    return this.agenda.conectar(contexto, dados.provedor);
  }

  /** A volta do consentimento: grava a conexão e abre o app (`mony://agenda?conexao=`). */
  @Get('oauth/callback')
  @Publico()
  @LiberadaParaVersaoAntiga()
  @ApiExcludeEndpoint()
  @Redirect()
  async callback(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Query('error') error: unknown,
  ): Promise<{ url: string; statusCode: number }> {
    return {
      url: await this.agenda.concluirConexao({ code, state, error }),
      statusCode: HttpStatus.FOUND,
    };
  }

  @Put('padrao')
  @ApiOkResponse({
    type: ListaAgendasDto,
    description: 'Onde os compromissos novos vão (RN-079); `null` deixa só no Mony.',
  })
  definirPadrao(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: AgendaPadraoDto,
  ): Promise<ListaAgendas> {
    return this.agenda.definirPadrao(contexto, dados.agendaId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'Desconectada: acesso revogado no provedor; os compromissos do app e da Mony ficam no Mony.',
  })
  desconectar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.agenda.desconectar(contexto, id);
  }
}

/** A agenda do período (doc 05, T-085a). */
@ApiTags('agenda')
@ApiBearerAuth()
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  @ApiOkResponse({
    type: AgendaDoPeriodoDto,
    description: 'Os compromissos que cruzam o período (até 93 dias), do mais cedo ao mais tarde.',
  })
  periodo(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaAgendaDto,
  ): Promise<AgendaDoPeriodo> {
    return this.agenda.agendaDoPeriodo(contexto, consulta);
  }
}

/** Compromissos (doc 05, T-085a): os externos são só leitura (RN-079). */
@ApiTags('agenda')
@ApiBearerAuth()
@Controller('compromissos')
export class CompromissosController {
  constructor(private readonly agenda: AgendaService) {}

  @Get(':id')
  @ApiOkResponse({ type: CompromissoDto })
  buscar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Compromisso> {
    return this.agenda.buscarCompromisso(contexto, id);
  }

  @Post()
  @Idempotente()
  @ApiCreatedResponse({ type: CompromissoDto, description: 'Na agenda padrão (RN-079).' })
  criar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: NovoCompromissoDto,
  ): Promise<Compromisso> {
    return this.agenda.criarCompromisso(contexto, dados);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CompromissoDto, description: 'Só os do app e da Mony (RN-079).' })
  atualizar(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: AtualizacaoCompromissoDto,
  ): Promise<Compromisso> {
    return this.agenda.atualizarCompromisso(contexto, id, dados);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Sai também da agenda conectada. Só os do app e da Mony.' })
  excluir(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.agenda.excluirCompromisso(contexto, id);
  }
}
