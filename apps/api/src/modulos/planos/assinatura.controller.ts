import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { esquemaUsoPlano, type UsoPlano } from '@mony/shared/planos';

import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { CotasService } from './cotas.service';

class UsoPlanoDto extends criarDto(esquemaUsoPlano) {}

/** Assinatura (doc 05). Por enquanto, o uso das cotas; o resto chega com a Stripe (T-102). */
@ApiTags('assinatura')
@ApiBearerAuth()
@Controller('assinatura')
export class AssinaturaController {
  constructor(private readonly cotas: CotasService) {}

  @Get('uso')
  @ApiOkResponse({
    type: UsoPlanoDto,
    description: 'O plano que vale agora e, no gratuito, o uso de cada limite (RN-120).',
  })
  uso(@ContextoAtual() contexto: Contexto): Promise<UsoPlano> {
    return this.cotas.uso(contexto);
  }
}
