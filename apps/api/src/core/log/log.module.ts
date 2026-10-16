import type { IncomingMessage } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';

import type { RequisicaoComRota } from '../../configurar-app';
import { Configuracao } from '../config/configuracao';

/** O que entra em todo log da requisição além do padrão do pino-http. */
export function propriedadesDaRequisicao(requisicao: IncomingMessage): { rota?: string } {
  const { rota } = requisicao as RequisicaoComRota;
  return rota === undefined ? {} : { rota };
}

/**
 * Logs em JSON estruturado com pino (doc 02); legíveis com pino-pretty só em desenvolvimento.
 * O id de cada requisição (`reqId` no log) vem do Fastify: ver `criarAdaptadorFastify`.
 */
export function opcoesDeLog(config: Configuracao): Params {
  return {
    pinoHttp: {
      level: config.nivelLog,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      autoLogging: { ignore: (requisicao) => requisicao.url === '/v1/health' },
      // O padrão da rota no log de cada requisição: tempo de resposta e falhas por rota saem
      // dele no CloudWatch Logs Insights (T-142d, doc 12).
      customProps: propriedadesDaRequisicao,
      transport:
        config.ambiente === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true } }
          : undefined,
    },
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [Configuracao],
      useFactory: opcoesDeLog,
    }),
  ],
})
export class LogModule {}
