import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaConsultaRelatorio,
  esquemaConsultaRelatorioCategorias,
  esquemaRelatorioAnual,
  esquemaRelatorioCartoes,
  esquemaRelatorioCategorias,
  esquemaRelatorioDiasDaSemana,
  esquemaRelatorioFormasPagamento,
  esquemaRelatorioMensal,
  type RelatorioAnual,
  type RelatorioCartoes,
  type RelatorioCategorias,
  type RelatorioDiasDaSemana,
  type RelatorioFormasPagamento,
  type RelatorioMensal,
} from '@mony/shared/relatorios';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { RecursoLimitado } from '../planos/recurso-limitado.decorator';
import { RelatoriosService } from './relatorios.service';

class ConsultaRelatorioDto extends criarDto(esquemaConsultaRelatorio) {}
class ConsultaRelatorioCategoriasDto extends criarDto(esquemaConsultaRelatorioCategorias) {}
class RelatorioMensalDto extends criarDto(esquemaRelatorioMensal) {}
class RelatorioAnualDto extends criarDto(esquemaRelatorioAnual) {}
class RelatorioCategoriasDto extends criarDto(esquemaRelatorioCategorias) {}
class RelatorioDiasDaSemanaDto extends criarDto(esquemaRelatorioDiasDaSemana) {}
class RelatorioCartoesDto extends criarDto(esquemaRelatorioCartoes) {}
class RelatorioFormasPagamentoDto extends criarDto(esquemaRelatorioFormasPagamento) {}

/**
 * Relatórios (doc 05, `GET /relatorios/:tipo?inicio=&fim=`; RN-150). Uma rota por tipo, para
 * cada uma ter o seu contrato. Sem período, os últimos 12 meses.
 */
@ApiTags('relatorios')
@ApiBearerAuth()
@RecursoLimitado('relatorio')
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

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
