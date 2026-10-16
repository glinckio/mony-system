import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type CustoMonyAdmin,
  esquemaConsultaCustoMonyAdmin,
  esquemaConsultaLogsMonyAdmin,
  esquemaCustoMonyAdmin,
  esquemaLimitesMony,
  esquemaLogsMonyAdmin,
  esquemaNovaVersaoMony,
  esquemaPrecosIaAdmin,
  esquemaVersaoMonyAdmin,
  esquemaVersoesMonyAdmin,
  type LimitesMony,
  type LogsMonyAdmin,
  type PrecosIaAdmin,
  type VersaoMonyAdmin,
  type VersoesMonyAdmin,
} from '@mony/shared/admin';

import { Admin } from '../../core/auth/admin.decorator';
import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { AdminMonyService } from './admin-mony.service';

class NovaVersaoMonyDto extends criarDto(esquemaNovaVersaoMony) {}
class VersaoMonyAdminDto extends criarDto(esquemaVersaoMonyAdmin) {}
class VersoesMonyAdminDto extends criarDto(esquemaVersoesMonyAdmin) {}
class ConsultaLogsMonyAdminDto extends criarDto(esquemaConsultaLogsMonyAdmin) {}
class LogsMonyAdminDto extends criarDto(esquemaLogsMonyAdmin) {}
class ConsultaCustoMonyAdminDto extends criarDto(esquemaConsultaCustoMonyAdmin) {}
class CustoMonyAdminDto extends criarDto(esquemaCustoMonyAdmin) {}
class PrecosIaAdminDto extends criarDto(esquemaPrecosIaAdmin) {}
class LimitesMonyDto extends criarDto(esquemaLimitesMony) {}

/** A seção Mony do painel (T-141e, doc 13). Só faz HTTP; a regra está no Service. */
@ApiTags('admin')
@ApiBearerAuth()
@Admin()
@Controller('admin/mony')
export class AdminMonyController {
  constructor(private readonly mony: AdminMonyService) {}

  @Get('versoes')
  @ApiOkResponse({ type: VersoesMonyAdminDto, description: 'Da versão mais nova à mais antiga.' })
  versoes(): Promise<VersoesMonyAdmin> {
    return this.mony.versoes();
  }

  @Get('versoes/:versao')
  @ApiOkResponse({
    type: VersaoMonyAdminDto,
    description: 'Com o prompt e o resultado de cada frase. A versão 0 é o prompt do código.',
  })
  versao(@Param('versao', ParseIntPipe) versao: number): Promise<VersaoMonyAdmin> {
    return this.mony.versao(versao);
  }

  @Post('versoes')
  @ApiOkResponse({ type: VersaoMonyAdminDto, description: 'Grava a próxima versão, inativa.' })
  criar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Body() dados: NovaVersaoMonyDto,
    @Ip() ip: string,
  ): Promise<VersaoMonyAdmin> {
    return this.mony.criar(admin.id, dados, ip);
  }

  @Post('versoes/:versao/avaliar')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOkResponse({
    type: VersaoMonyAdminDto,
    description:
      'Roda as frases de teste no worker. 409 com o modelo falso ou com outra avaliação da versão rodando.',
  })
  avaliar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('versao', ParseIntPipe) versao: number,
    @Ip() ip: string,
  ): Promise<VersaoMonyAdmin> {
    return this.mony.avaliar(admin.id, versao, ip);
  }

  @Post('versoes/:versao/ativar')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: VersaoMonyAdminDto,
    description: 'Ativa a versão; 409 se a avaliação não chegou ao mínimo.',
  })
  ativar(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Param('versao', ParseIntPipe) versao: number,
    @Ip() ip: string,
  ): Promise<VersaoMonyAdmin> {
    return this.mony.ativar(admin.id, versao, ip);
  }

  @Get('logs')
  @ApiOkResponse({
    type: LogsMonyAdminDto,
    description: 'As chamadas ao modelo com erro, da mais nova à mais antiga. Grava `auditoria`.',
  })
  logs(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Query() consulta: ConsultaLogsMonyAdminDto,
    @Ip() ip: string,
  ): Promise<LogsMonyAdmin> {
    return this.mony.logs(admin.id, consulta, ip);
  }

  @Get('custo')
  @ApiOkResponse({
    type: CustoMonyAdminDto,
    description: 'Chamadas, tokens e custo por modelo no período (dias de São Paulo).',
  })
  custo(@Query() consulta: ConsultaCustoMonyAdminDto): Promise<CustoMonyAdmin> {
    return this.mony.custo(consulta);
  }

  @Get('precos')
  @ApiOkResponse({ type: PrecosIaAdminDto, description: 'Centavos de dólar por milhão de tokens.' })
  precos(): Promise<PrecosIaAdmin> {
    return this.mony.precos();
  }

  @Put('precos')
  @ApiOkResponse({ type: PrecosIaAdminDto, description: 'Troca a tabela inteira.' })
  salvarPrecos(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Body() dados: PrecosIaAdminDto,
    @Ip() ip: string,
  ): Promise<PrecosIaAdmin> {
    return this.mony.salvarPrecos(admin.id, dados, ip);
  }

  @Get('limites')
  @ApiOkResponse({
    type: LimitesMonyDto,
    description: 'Mensagens e leituras por usuário por dia, em todos os planos.',
  })
  limites(): Promise<LimitesMony> {
    return this.mony.limites();
  }

  @Put('limites')
  @ApiOkResponse({ type: LimitesMonyDto, description: 'Vale em até 30 s em todos os processos.' })
  salvarLimites(
    @UsuarioAtual() admin: UsuarioAutenticado,
    @Body() dados: LimitesMonyDto,
    @Ip() ip: string,
  ): Promise<LimitesMony> {
    return this.mony.salvarLimites(admin.id, dados, ip);
  }
}
