import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';

import { Configuracao } from '../config/configuracao';
import { type ClientePrisma, criarClientePrisma } from './cliente';

/**
 * Acesso ao banco para os repositories (doc 05: Controller → Service → Repository). A conexão é
 * aberta na primeira consulta, então subir a API sem banco não falha.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly cliente: ClientePrisma;

  constructor(config: Configuracao) {
    this.cliente = criarClientePrisma(config.urlBanco);
  }

  async onModuleDestroy(): Promise<void> {
    await this.cliente.$disconnect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
