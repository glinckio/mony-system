import { Module } from '@nestjs/common';

import { AjudaService } from './ajuda.service';

/** Base de ajuda do app, para a ferramenta `ajuda_app` da Mony (doc 08). */
@Module({
  providers: [AjudaService],
  exports: [AjudaService],
})
export class AjudaModule {}
