import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { Publico } from '../auth/publico.decorator';
import { LiberadaParaVersaoAntiga } from '../versao-app/versao-app';

const esquemaSaude = z.object({ status: z.literal('ok') });

class SaudeDto extends createZodDto(esquemaSaude) {}

/** Verificação de saúde para o balanceador (ALB) e para o ambiente local. */
@ApiTags('saude')
@Publico()
@LiberadaParaVersaoAntiga()
@Controller('health')
export class SaudeController {
  @Get()
  @ApiOkResponse({ type: SaudeDto, description: 'A API está no ar.' })
  verificar(): SaudeDto {
    return { status: 'ok' };
  }
}
