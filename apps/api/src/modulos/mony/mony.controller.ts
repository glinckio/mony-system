import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaMensagemMony,
  esquemaPedidoAcaoMony,
  esquemaRespostaAcaoMony,
  formatarEventoSse,
  type RespostaAcaoMony,
} from '@mony/shared/mony';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { CABECALHO_ID_REQUISICAO } from '../../configurar-app';
import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { criarDto } from '../../core/openapi/dto';
import { MonyService } from './mony.service';

class MensagemMonyDto extends criarDto(esquemaMensagemMony) {}
class PedidoAcaoMonyDto extends criarDto(esquemaPedidoAcaoMony) {}
class RespostaAcaoMonyDto extends criarDto(esquemaRespostaAcaoMony) {}

/** Comentário SSE a cada 15 s: o ALB e proxies não derrubam a conexão parada (doc 08). */
const INTERVALO_PING_MS = 15_000;

/** Mony (doc 08): chat em SSE e ações por botão. PoC da T-020. */
@ApiTags('mony')
@ApiBearerAuth()
@Controller('mony')
export class MonyController {
  constructor(private readonly mony: MonyService) {}

  /**
   * Resposta em SSE (`text/event-stream`): eventos `texto.delta`, `componente`, `erro` e `fim`
   * (contrato em `@mony/shared/mony`). Fica fora do OpenAPI: o cliente gerado não lê streaming, e o
   * app usa o `expo/fetch`.
   */
  @Post('mensagens')
  @ApiExcludeEndpoint()
  async mensagem(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: MensagemMonyDto,
    @Req() requisicao: FastifyRequest,
    @Res() resposta: FastifyReply,
  ): Promise<void> {
    resposta.hijack();
    const saida = resposta.raw;
    saida.writeHead(HttpStatus.OK, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      // Desliga o buffer de proxies (nginx e afins) no caminho.
      'x-accel-buffering': 'no',
      [CABECALHO_ID_REQUISICAO]: requisicao.id,
    });
    const controle = new AbortController();
    saida.on('close', () => {
      if (!saida.writableFinished) controle.abort();
    });
    const ping = setInterval(() => saida.write(': ping\n\n'), INTERVALO_PING_MS);
    try {
      for await (const evento of this.mony.responder(contexto, dados, controle.signal)) {
        if (controle.signal.aborted) break;
        saida.write(formatarEventoSse(evento));
      }
    } catch (erro) {
      requisicao.log.error({ err: erro }, 'Falha na resposta da Mony');
      if (!controle.signal.aborted) {
        saida.write(
          formatarEventoSse({
            tipo: 'erro',
            codigo: 'ERRO_INTERNO',
            mensagem: 'Algo deu errado do nosso lado. Tente de novo.',
          }),
        );
      }
    } finally {
      clearInterval(ping);
      saida.end();
    }
  }

  /** Toque num botão da Mony (RN-084): `acao` volta como veio no componente. */
  @Post('acoes')
  @HttpCode(HttpStatus.OK)
  @Idempotente()
  @ApiOkResponse({ type: RespostaAcaoMonyDto })
  agir(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: PedidoAcaoMonyDto,
  ): Promise<RespostaAcaoMony> {
    return this.mony.agir(contexto, dados.acao);
  }
}
