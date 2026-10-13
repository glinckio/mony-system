import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaConsultaConversa,
  esquemaMensagemMony,
  esquemaPaginaConversa,
  esquemaPedidoAcaoMony,
  esquemaRespostaAcaoMony,
  formatarEventoSse,
  type PaginaConversa,
  type RespostaAcaoMony,
} from '@mony/shared/mony';
import { esquemaPedidoNfce } from '@mony/shared/nfce';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { CABECALHO_ID_REQUISICAO } from '../../configurar-app';
import { type Contexto, ContextoAtual } from '../../core/contexto/contexto';
import { Idempotente } from '../../core/idempotencia/idempotente.decorator';
import { criarDto } from '../../core/openapi/dto';
import { RecursoLimitado } from '../planos/recurso-limitado.decorator';
import { MonyService } from './mony.service';
import { NfceMony } from './nfce.service';
import { MonyOrquestrador } from './orquestrador.service';

class MensagemMonyDto extends criarDto(esquemaMensagemMony) {}
class PedidoAcaoMonyDto extends criarDto(esquemaPedidoAcaoMony) {}
class RespostaAcaoMonyDto extends criarDto(esquemaRespostaAcaoMony) {}
class ConsultaConversaDto extends criarDto(esquemaConsultaConversa) {}
class PaginaConversaDto extends criarDto(esquemaPaginaConversa) {}
class PedidoNfceDto extends criarDto(esquemaPedidoNfce) {}

/** Comentário SSE a cada 15 s: o ALB e proxies não derrubam a conexão parada (doc 08). */
const INTERVALO_PING_MS = 15_000;

/** Mony (doc 08): chat em SSE, ações por botão, o QR Code do cupom fiscal e o histórico da conversa. */
@ApiTags('mony')
@ApiBearerAuth()
@Controller('mony')
export class MonyController {
  constructor(
    private readonly orquestrador: MonyOrquestrador,
    private readonly mony: MonyService,
    private readonly nfce: NfceMony,
  ) {}

  /**
   * Resposta em SSE (`text/event-stream`): eventos `texto.delta`, `componente`, `erro` e `fim`
   * (contrato em `@mony/shared/mony`). Fica fora do OpenAPI: o cliente gerado não lê streaming, e o
   * app usa o `expo/fetch`. Com `Idempotency-Key` (opcional), o reenvio repete a resposta gravada.
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
      for await (const evento of this.orquestrador.processar(contexto, dados, controle.signal)) {
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

  /**
   * QR Code do cupom fiscal (T-066a): o app manda o que leu; a Mony consulta a nota na Sefaz e
   * devolve a compra para confirmar (RN-083), ou avisa que vai tentar de novo, ou pede a foto. Conta
   * na cota `leitura_documento` do gratuito (RN-120), só quando consulta.
   */
  @Post('nfce')
  @HttpCode(HttpStatus.OK)
  @Idempotente()
  @RecursoLimitado('leitura_documento')
  @ApiOkResponse({ type: RespostaAcaoMonyDto })
  lerNfce(
    @ContextoAtual() contexto: Contexto,
    @Body() dados: PedidoNfceDto,
  ): Promise<RespostaAcaoMony> {
    return this.nfce.ler(contexto, dados);
  }

  /** Histórico do chat, da mensagem mais nova para a mais antiga. */
  @Get('conversa')
  @ApiOkResponse({ type: PaginaConversaDto, description: 'Da mais nova para a mais antiga.' })
  conversa(
    @ContextoAtual() contexto: Contexto,
    @Query() consulta: ConsultaConversaDto,
  ): Promise<PaginaConversa> {
    return this.mony.conversa(contexto, consulta);
  }
}
