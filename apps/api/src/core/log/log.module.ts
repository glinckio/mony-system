import { Module } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';

import { Configuracao } from '../config/configuracao';

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
