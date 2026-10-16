import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaExportacaoDados,
  esquemaUltimaExportacaoDados,
  type ExportacaoDados,
  type UltimaExportacaoDados,
} from '@mony/shared/usuario';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { criarDto } from '../../core/openapi/dto';
import { ExportacaoDadosService } from './exportacao-dados.service';

class ExportacaoDadosDto extends criarDto(esquemaExportacaoDados) {}
class UltimaExportacaoDadosDto extends criarDto(esquemaUltimaExportacaoDados) {}

/** LGPD (doc 11): exportar os dados (RN-160). A exclusão da conta vem na T-140b. */
@ApiTags('usuario')
@ApiBearerAuth()
@Controller('me')
export class LgpdController {
  constructor(private readonly exportacoes: ExportacaoDadosService) {}

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
}
