import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Redirect,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaLinkCobranca,
  esquemaPedidoCheckout,
  esquemaPlanosAVenda,
  esquemaSituacaoAssinatura,
  type LinkCobranca,
  type PlanosAVenda,
  RESULTADOS_RETORNO_COBRANCA,
  type ResultadoRetornoCobranca,
  type SituacaoAssinaturaPaga,
} from '@mony/shared/planos';
import type { FastifyRequest } from 'fastify';

import { Publico } from '../../core/auth/publico.decorator';
import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { criarDto } from '../../core/openapi/dto';
import { LiberadaParaVersaoAntiga } from '../../core/versao-app/versao-app';
import { AssinaturasService, linkDoRetorno } from './assinaturas.service';

class PlanosAVendaDto extends criarDto(esquemaPlanosAVenda) {}
class SituacaoAssinaturaDto extends criarDto(esquemaSituacaoAssinatura) {}
class PedidoCheckoutDto extends criarDto(esquemaPedidoCheckout) {}
class LinkCobrancaDto extends criarDto(esquemaLinkCobranca) {}

const ehResultado = (valor: unknown): valor is ResultadoRetornoCobranca =>
  (RESULTADOS_RETORNO_COBRANCA as readonly unknown[]).includes(valor);

/** Planos à venda (doc 05). */
@ApiTags('assinatura')
@ApiBearerAuth()
@Controller('planos')
export class PlanosController {
  constructor(private readonly assinaturas: AssinaturasService) {}

  @Get()
  @ApiOkResponse({ type: PlanosAVendaDto, description: 'Os preços vigentes (RN-129).' })
  planos(): Promise<PlanosAVenda> {
    return this.assinaturas.planos();
  }
}

/** Assinatura paga pela Stripe (doc 05 e 10, T-102). O uso das cotas fica em `planos/`. */
@ApiTags('assinatura')
@ApiBearerAuth()
@Controller('assinatura')
export class AssinaturasController {
  constructor(private readonly assinaturas: AssinaturasService) {}

  @Get()
  @ApiOkResponse({
    type: SituacaoAssinaturaDto,
    description:
      'O plano que vale agora e a assinatura paga. Depois do checkout, o app consulta aqui (RN-128).',
  })
  situacao(@ContextoAtual() contexto: Contexto): Promise<SituacaoAssinaturaPaga> {
    return this.assinaturas.situacao(contexto);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: LinkCobrancaDto,
    description: 'A página de pagamento da Stripe, para abrir no navegador do app.',
  })
  checkout(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: PedidoCheckoutDto,
  ): Promise<LinkCobranca> {
    return this.assinaturas.checkout(contexto, dados.plano);
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: LinkCobrancaDto,
    description: 'O portal da Stripe: trocar plano, forma de pagamento e cancelar.',
  })
  portal(@ContextoAtual() contexto: Contexto): Promise<LinkCobranca> {
    return this.assinaturas.portal(contexto);
  }

  /**
   * Onde a Stripe devolve a pessoa (ela só aceita endereço https): redireciona para o app, e o
   * navegador do app fecha ao ver o `mony://`.
   */
  @Get('retorno')
  @Publico()
  @LiberadaParaVersaoAntiga()
  @ApiExcludeEndpoint()
  @Redirect()
  retorno(@Query('resultado') resultado: unknown): { url: string; statusCode: number } {
    return {
      url: linkDoRetorno(ehResultado(resultado) ? resultado : 'cancelado'),
      statusCode: HttpStatus.FOUND,
    };
  }
}

/** Webhooks dos provedores (doc 05, "Webhooks"). */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly assinaturas: AssinaturasService) {}

  @Post('stripe')
  @Publico()
  @LiberadaParaVersaoAntiga()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async stripe(
    @Req() requisicao: FastifyRequest & { rawBody?: Buffer },
    @Headers('stripe-signature') assinatura: string | undefined,
  ): Promise<{ recebido: true }> {
    await this.assinaturas.receberWebhook(requisicao.rawBody, assinatura);
    return { recebido: true };
  }
}
