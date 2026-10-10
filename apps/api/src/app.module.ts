import { Module } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';

import { AuthModule } from './core/auth/auth.module';
import { FiltroErros } from './core/erros/filtro-erros';
import { EventosModule } from './core/eventos/eventos.module';
import { IdempotenciaModule } from './core/idempotencia/idempotencia.module';
import { LimitesModule } from './core/limites/limite-tentativas';
import { NucleoModule } from './core/nucleo.module';
import { SaudeController } from './core/saude/saude.controller';
import { VersaoAppModule } from './core/versao-app/versao-app';
import { ArmazenamentoModule } from './core/arquivos/armazenamento-arquivos';
import { ArquivosModule } from './modulos/arquivos/arquivos.module';
import { AutenticacaoModule } from './modulos/autenticacao/autenticacao.module';
import { CategoriasModule } from './modulos/categorias/categorias.module';
import { ConfigAppModule } from './modulos/config-app/config-app';
import { ContasModule } from './modulos/contas/contas.module';
import { RecorrenciasModule } from './modulos/recorrencias/recorrencias.module';
import { TransacoesModule } from './modulos/transacoes/transacoes.module';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';

/** Módulo raiz da API HTTP. Os módulos de domínio (`modulos/*`) entram aqui. */
@Module({
  imports: [
    NucleoModule,
    EventosModule,
    IdempotenciaModule,
    VersaoAppModule,
    AuthModule,
    LimitesModule,
    AutenticacaoModule,
    UsuariosModule,
    ConfigAppModule,
    CategoriasModule,
    ContasModule,
    ArmazenamentoModule,
    ArquivosModule,
    TransacoesModule,
    RecorrenciasModule,
  ],
  controllers: [SaudeController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: FiltroErros },
  ],
})
export class AppModule {}
