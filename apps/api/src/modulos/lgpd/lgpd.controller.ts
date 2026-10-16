import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  esquemaExclusaoConta,
  esquemaExportacaoDados,
  esquemaPedidoExclusaoConta,
  esquemaUltimaExportacaoDados,
  type ExclusaoConta,
  type ExportacaoDados,
  type UltimaExportacaoDados,
} from '@mony/shared/usuario';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { criarDto } from '../../core/openapi/dto';
import { ExclusaoContaService } from './exclusao-conta.service';
import { ExportacaoDadosService } from './exportacao-dados.service';

class ExportacaoDadosDto extends criarDto(esquemaExportacaoDados) {}
class UltimaExportacaoDadosDto extends criarDto(esquemaUltimaExportacaoDados) {}
class PedidoExclusaoContaDto extends criarDto(esquemaPedidoExclusaoConta) {}
class ExclusaoContaDto extends criarDto(esquemaExclusaoConta) {}

/** LGPD (doc 11): exportar os dados (RN-160) e excluir a conta (RN-161). */
@ApiTags('usuario')
@ApiBearerAuth()
@Controller('me')
export class LgpdController {
  constructor(
    private readonly exportacoes: ExportacaoDadosService,
    private readonly exclusao: ExclusaoContaService,
  ) {}

  /**
   * RN-160: pede o arquivo com todos os dados; o worker gera e manda o link por e-mail. Pedir de
   * novo enquanto gera devolve a mesma exportação.
   */
  @Post('exportar')
  @Idempotente()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: ExportacaoDadosDto, description: 'Exportação em andamento.' })
  exportar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ExportacaoDados> {
    return this.exportacoes.pedir(usuario.id);
  }

  @Get('exportar')
  @ApiOkResponse({
    type: UltimaExportacaoDadosDto,
    description: 'A última exportação; pronta, com a URL assinada do ZIP, válida por 24 horas.',
  })
  ultimaExportacao(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<UltimaExportacaoDados> {
    return this.exportacoes.ultima(usuario.id);
  }

  @Get('exclusao')
  @ApiOkResponse({
    type: ExclusaoContaDto,
    description: 'A exclusão agendada da conta, se houver.',
  })
  exclusaoAgendada(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ExclusaoConta> {
    return this.exclusao.situacao(usuario.id);
  }

  /** RN-161: manda por e-mail o código que confirma a exclusão sem a senha. */
  @Post('exclusao/codigo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Código enviado para o e-mail da conta.' })
  pedirCodigoExclusao(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Ip() ip: string,
  ): Promise<void> {
    return this.exclusao.pedirCodigo(usuario.id, ip);
  }

  /**
   * RN-161: confirma com a senha ou o código e agenda a exclusão para daqui a 7 dias. Encerra as
   * sessões de todos os aparelhos; entrar de novo nesse prazo permite desistir.
   */
  @Post('exclusao')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ExclusaoContaDto, description: 'Exclusão agendada; sessões encerradas.' })
  pedirExclusao(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dados: PedidoExclusaoContaDto,
    @Ip() ip: string,
  ): Promise<ExclusaoConta> {
    return this.exclusao.pedir(usuario.id, dados, ip);
  }

  /** RN-161: desiste da exclusão dentro do prazo; tudo fica como estava. */
  @Delete('exclusao')
  @ApiOkResponse({ type: ExclusaoContaDto, description: 'Exclusão desfeita.' })
  desistirDaExclusao(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ExclusaoConta> {
    return this.exclusao.desistir(usuario.id);
  }
}
