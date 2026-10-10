import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type ConfigApp, esquemaConfigApp, SUGESTOES_CHAT_PADRAO } from '@mony/shared/config-app';
import { createZodDto } from 'nestjs-zod';

import { Publico } from '../../core/auth/publico.decorator';
import { Configuracao } from '../../core/config/configuracao';
import { LiberadaParaVersaoAntiga } from '../../core/versao-app/versao-app';

class ConfigAppDto extends createZodDto(esquemaConfigApp) {}

/**
 * O que o app precisa saber ao abrir (doc 04): versão mínima, recursos ligados e sugestões do
 * chat. A versão mínima vem do ambiente; o painel admin passa a editá-la na T-141.
 */
@Injectable()
export class ConfigAppService {
  constructor(private readonly config: Configuracao) {}

  obter(): ConfigApp {
    return {
      versaoMinima: this.config.versoesMinimasApp,
      // O app só mostra os botões de login social com os IDs de cliente configurados (T-032).
      flags: {
        loginGoogle: this.config.clientesGoogle.length > 0,
        loginApple: this.config.clientesApple.length > 0,
      },
      sugestoesChat: [...SUGESTOES_CHAT_PADRAO],
    };
  }
}

@ApiTags('app')
@Publico()
@LiberadaParaVersaoAntiga()
@Controller('config-app')
export class ConfigAppController {
  constructor(private readonly configApp: ConfigAppService) {}

  @Get()
  @ApiOkResponse({ type: ConfigAppDto, description: 'Configuração do app; não exige login.' })
  obter(): ConfigApp {
    return this.configApp.obter();
  }
}

@Module({ controllers: [ConfigAppController], providers: [ConfigAppService] })
export class ConfigAppModule {}
