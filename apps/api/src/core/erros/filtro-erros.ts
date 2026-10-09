import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { type CodigoErro, criarRespostaErro, type RespostaErro } from '@mony/shared/erros';
import type { FastifyReply } from 'fastify';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

import { ErroDominio } from './erro-dominio';

interface Traducao {
  status: number;
  corpo: RespostaErro;
}

/** Código do catálogo para cada status HTTP vindo do Nest ou do Fastify. */
const CODIGO_POR_STATUS: Partial<Record<number, CodigoErro>> = {
  400: 'REQUISICAO_INVALIDA',
  401: 'NAO_AUTENTICADO',
  403: 'ACESSO_NEGADO',
  404: 'NAO_ENCONTRADO',
  409: 'CONFLITO',
  429: 'MUITAS_TENTATIVAS',
  503: 'SERVICO_INDISPONIVEL',
};

function codigoDoStatus(status: number): CodigoErro {
  return CODIGO_POR_STATUS[status] ?? (status < 500 ? 'REQUISICAO_INVALIDA' : 'ERRO_INTERNO');
}

/** Erros do próprio Fastify (ex.: JSON malformado) trazem `statusCode`. */
function statusDoFastify(excecao: unknown): number | undefined {
  if (typeof excecao !== 'object' || excecao === null || !('statusCode' in excecao)) {
    return undefined;
  }
  const { statusCode } = excecao;
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
    ? statusCode
    : undefined;
}

function problemasDeValidacao(erro: ZodError): { caminho: string; mensagem: string }[] {
  return erro.issues.map((problema) => ({
    caminho: problema.path.map(String).join('.'),
    mensagem: problema.message,
  }));
}

/**
 * Filtro global: toda resposta de erro sai no formato `{ erro: { codigo, mensagem, detalhes? } }`
 * (docs/arquitetura/05). Erro inesperado vira `ERRO_INTERNO` sem mensagem nem stack na resposta;
 * o detalhe vai só para o log.
 */
@Catch()
export class FiltroErros implements ExceptionFilter {
  constructor(@InjectPinoLogger(FiltroErros.name) private readonly log: PinoLogger) {}

  catch(excecao: unknown, host: ArgumentsHost): void {
    const { status, corpo } = this.traduzir(excecao);
    if (status >= 500) {
      this.log.error({ err: excecao }, 'Erro não tratado');
    }
    const resposta = host.switchToHttp().getResponse<FastifyReply>();
    void resposta.status(status).send(corpo);
  }

  private traduzir(excecao: unknown): Traducao {
    if (excecao instanceof ErroDominio) {
      return {
        status: excecao.status,
        corpo: criarRespostaErro(excecao.codigo, {
          mensagem: excecao.message,
          ...(excecao.detalhes ? { detalhes: excecao.detalhes } : {}),
        }),
      };
    }

    if (excecao instanceof ZodValidationException) {
      const erroZod = excecao.getZodError();
      return {
        status: 400,
        corpo: criarRespostaErro('REQUISICAO_INVALIDA', {
          ...(erroZod instanceof ZodError
            ? { detalhes: { problemas: problemasDeValidacao(erroZod) } }
            : {}),
        }),
      };
    }

    const status =
      excecao instanceof HttpException ? excecao.getStatus() : statusDoFastify(excecao);
    if (status !== undefined && status < 500) {
      return { status, corpo: criarRespostaErro(codigoDoStatus(status)) };
    }
    if (status === 503) {
      return { status, corpo: criarRespostaErro('SERVICO_INDISPONIVEL') };
    }
    return { status: 500, corpo: criarRespostaErro('ERRO_INTERNO') };
  }
}
