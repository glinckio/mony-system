import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaConsultaPrecos,
  esquemaConsultaRelatorio,
  esquemaConsultaRelatorioCategorias,
  esquemaExportacao,
  esquemaPedidoExportacao,
  esquemaRelatorioAnual,
  esquemaRelatorioCartoes,
  esquemaRelatorioCategorias,
  esquemaRelatorioDiasDaSemana,
  esquemaRelatorioFormasPagamento,
  esquemaRelatorioMensal,
  esquemaRelatorioPrecos,
  type Exportacao,
  type RelatorioAnual,
  type RelatorioCartoes,
  type RelatorioCategorias,
  type RelatorioDiasDaSemana,
  type RelatorioFormasPagamento,
  type RelatorioMensal,
  type RelatorioPrecos,
} from '@mony/shared/relatorios';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { criarDto } from '../../core/openapi/dto';
import { RecursoLimitado } from '../planos/recurso-limitado.decorator';
import { ExportacoesRelatorio } from './exportacoes.service';
import { RelatoriosService } from './relatorios.service';

class ConsultaRelatorioDto extends criarDto(esquemaConsultaRelatorio) {}
class ConsultaRelatorioCategoriasDto extends criarDto(esquemaConsultaRelatorioCategorias) {}
class RelatorioMensalDto extends criarDto(esquemaRelatorioMensal) {}
class RelatorioAnualDto extends criarDto(esquemaRelatorioAnual) {}
class RelatorioCategoriasDto extends criarDto(esquemaRelatorioCategorias) {}
class RelatorioDiasDaSemanaDto extends criarDto(esquemaRelatorioDiasDaSemana) {}
class RelatorioCartoesDto extends criarDto(esquemaRelatorioCartoes) {}
class RelatorioFormasPagamentoDto extends criarDto(esquemaRelatorioFormasPagamento) {}
class PedidoExportacaoDto extends criarDto(esquemaPedidoExportacao) {}
class ConsultaPrecosDto extends criarDto(esquemaConsultaPrecos) {}
class RelatorioPrecosDto extends criarDto(esquemaRelatorioPrecos) {}
class ExportacaoDto extends criarDto(esquemaExportacao) {}

/**
 * Relatórios (doc 05, `GET /relatorios/:tipo?inicio=&fim=`; RN-150). Uma rota por tipo, para
 * cada uma ter o seu contrato. Sem período, os últimos 12 meses.
 */
@ApiTags('relatorios')
@ApiBearerAuth()
@RecursoLimitado('relatorio')
@Controller('relatorios')
export class RelatoriosController {
  constructor(
    private readonly relatorios: RelatoriosService,
    private readonly exportacoes: ExportacoesRelatorio,
  ) {}

  /**
   * RN-151: pede o relatório do período em PDF ou XLSX; o worker gera o arquivo. A resposta volta
   * `processando`; `GET /relatorios/exportacoes/:id` diz quando fica pronta e traz a URL (24 h).
   * No gratuito, 403 `LIMITE_PLANO_ATINGIDO`.
   */
  @Post('exportar')
  @Idempotente()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: ExportacaoDto, description: 'Exportação em andamento.' })
  exportar(
    @ContextoAtual() contexto: Contexto,
    @Body() pedido: PedidoExportacaoDto,
  ): Promise<Exportacao> {
    return this.exportacoes.pedir(contexto, pedido);
  }

  @Get('precos')
  @ApiOkResponse({
    type: RelatorioPrecosDto,
    description:
      'Histórico de preços dos cupons fiscais (NFC-e): último preço, menor e média por loja.',
  })
  precos(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaPrecosDto,
  ): Promise<RelatorioPrecos> {
    return this.relatorios.precos(contexto, consulta);
  }

  @Get('exportacoes/:id')
  @ApiOkResponse({
    type: ExportacaoDto,
    description: 'A exportação; pronta, com a URL assinada do arquivo, válida por 24 horas.',
  })
  exportacao(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Exportacao> {
    return this.exportacoes.buscar(contexto, id);
  }

  @Get('mensal')
  @ApiOkResponse({ type: RelatorioMensalDto, description: 'Receitas × despesas por mês.' })
  mensal(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaRelatorioDto,
  ): Promise<RelatorioMensal> {
    return this.relatorios.mensal(contexto, consulta);
  }

  @Get('anual')
  @ApiOkResponse({ type: RelatorioAnualDto, description: 'Evolução anual.' })
  anual(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaRelatorioDto,
  ): Promise<RelatorioAnual> {
    return this.relatorios.anual(contexto, consulta);
  }

  @Get('categorias')
  @ApiOkResponse({
    type: RelatorioCategoriasDto,
    description: 'Despesas ou receitas por categoria.',
  })
  categorias(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaRelatorioCategoriasDto,
  ): Promise<RelatorioCategorias> {
    return this.relatorios.categorias(contexto, consulta);
  }

  @Get('dias-da-semana')
  @ApiOkResponse({ type: RelatorioDiasDaSemanaDto, description: 'Despesas por dia da semana.' })
  diasDaSemana(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaRelatorioDto,
  ): Promise<RelatorioDiasDaSemana> {
    return this.relatorios.diasDaSemana(contexto, consulta);
  }

  @Get('cartoes')
  @ApiOkResponse({ type: RelatorioCartoesDto, description: 'Despesas por cartão de crédito.' })
  cartoes(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaRelatorioDto,
  ): Promise<RelatorioCartoes> {
    return this.relatorios.cartoes(contexto, consulta);
  }

  @Get('formas-pagamento')
  @ApiOkResponse({
    type: RelatorioFormasPagamentoDto,
    description: 'Despesas por forma de pagamento.',
  })
  formasPagamento(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaRelatorioDto,
  ): Promise<RelatorioFormasPagamento> {
    return this.relatorios.formasPagamento(contexto, consulta);
  }
}
