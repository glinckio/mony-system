import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type EnvioArquivo,
  esquemaEnvioArquivo,
  esquemaLeituraArquivo,
  esquemaNovoArquivo,
  type LeituraArquivo,
} from '@mony/shared/arquivos';
import { createZodDto } from 'nestjs-zod';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { ArquivosService } from './arquivos.service';

class NovoArquivoDto extends createZodDto(esquemaNovoArquivo) {}
class EnvioArquivoDto extends createZodDto(esquemaEnvioArquivo) {}
class LeituraArquivoDto extends createZodDto(esquemaLeituraArquivo) {}

/** Rotas de arquivos (doc 05): só URLs assinadas; o arquivo não passa pela API. */
@ApiTags('arquivos')
@ApiBearerAuth()
@Controller('arquivos')
export class ArquivosController {
  constructor(private readonly arquivos: ArquivosService) {}

  @Post()
  @ApiCreatedResponse({
    type: EnvioArquivoDto,
    description: 'URL para enviar o arquivo por PUT (vale 5 minutos).',
  })
  preparar(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: NovoArquivoDto,
  ): Promise<EnvioArquivo> {
    return this.arquivos.preparar(contexto, dados);
  }

  @Get(':id')
  @ApiOkResponse({
    type: LeituraArquivoDto,
    description: 'URL para ler o arquivo (vale 15 minutos).',
  })
  ler(
    @ContextoAtual() contexto: Contexto,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeituraArquivo> {
    return this.arquivos.ler(contexto, id);
  }
}
