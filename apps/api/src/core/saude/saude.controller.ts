import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { Publico } from '../auth/publico.decorator';
import { SemLimiteGeral } from '../limites/limite-geral';
import { criarDto } from '../openapi/dto';
import { LiberadaParaVersaoAntiga } from '../versao-app/versao-app';

const esquemaSaude = z.object({ status: z.literal('ok') });

class SaudeDto extends criarDto(esquemaSaude) {}

/** Verificação de saúde para o balanceador (ALB) e para o ambiente local. */
@ApiTags('saude')
@Publico()
@LiberadaParaVersaoAntiga()
@SemLimiteGeral()
@Controller('health')
export class SaudeController {
  @Get()
  @ApiOkResponse({ type: SaudeDto, description: 'A API está no ar.' })
  verificar(): SaudeDto {
    return { status: 'ok' };
  }
}
