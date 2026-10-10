import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Module,
  SetMetadata,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import {
  CABECALHO_PLATAFORMA,
  CABECALHO_VERSAO_APP,
  versaoAbaixoDaMinima,
} from '@mony/shared/config-app';
import type { FastifyRequest } from 'fastify';

import { Configuracao } from '../config/configuracao';
import { ErroDominio } from '../erros/erro-dominio';

export const LIBERADA_PARA_VERSAO_ANTIGA = 'mony:liberada-para-versao-antiga';

/**
 * Rota que responde a qualquer versão do app: `GET /config-app` (é por ela que o app descobre
 * que precisa atualizar) e o health check.
 */
export const LiberadaParaVersaoAntiga = (): MethodDecorator & ClassDecorator =>
  SetMetadata(LIBERADA_PARA_VERSAO_ANTIGA, true);

function cabecalho(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Guarda global (doc 04): app com `X-App-Version` abaixo da mínima da plataforma (`X-Platform`)
 * recebe 426 `VERSAO_APP_DESATUALIZADA`, com a versão mínima em `detalhes`. Sem os cabeçalhos
 * (painel admin, ferramentas) não há bloqueio.
 */
@Injectable()
export class GuardaVersaoApp implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: Configuracao,
  ) {}

  canActivate(execucao: ExecutionContext): boolean {
    const liberada = this.reflector.getAllAndOverride<boolean | undefined>(
      LIBERADA_PARA_VERSAO_ANTIGA,
      [execucao.getHandler(), execucao.getClass()],
    );
    if (liberada) return true;

    const { headers } = execucao.switchToHttp().getRequest<FastifyRequest>();
    const versao = cabecalho(headers[CABECALHO_VERSAO_APP]);
    const plataforma = cabecalho(headers[CABECALHO_PLATAFORMA]);
    const minimas = this.config.versoesMinimasApp;
    if (versaoAbaixoDaMinima(versao, plataforma, minimas)) {
      throw new ErroDominio('VERSAO_APP_DESATUALIZADA', {
        detalhes: { plataforma, versaoMinima: minimas[plataforma as keyof typeof minimas] },
      });
    }
    return true;
  }
}

/** Registra a guarda de versão do app antes da de autenticação. */
@Module({ providers: [{ provide: APP_GUARD, useClass: GuardaVersaoApp }] })
export class VersaoAppModule {}
