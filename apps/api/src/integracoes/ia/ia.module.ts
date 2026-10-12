import { Logger, Module } from '@nestjs/common';

import { Configuracao } from '../../core/config/configuracao';
import { LlmAnthropic } from './llm-anthropic';
import { LlmFake } from './llm-fake';
import { LlmProvider } from './llm.provider';
import { TranscricaoDeepgram } from './transcricao-deepgram';
import { TranscricaoFake } from './transcricao-fake';
import { TranscricaoProvider } from './transcricao.provider';

/** Escolhe o modelo pelo `IA_PROVEDOR`. */
export function criarProvedorLlm(config: Configuracao): LlmProvider {
  if (config.provedorIa === 'anthropic') {
    // A validação do ambiente já exige a chave; o `throw` só convence o TypeScript.
    const chave = config.chaveAnthropic;
    if (chave === undefined) throw new Error('IA_PROVEDOR=anthropic exige ANTHROPIC_CHAVE_API');
    return new LlmAnthropic(chave, config.modeloIa);
  }
  if (config.ehProducao) {
    new Logger('IA').warn('IA_PROVEDOR=fake em produção: a Mony responde um texto fixo.');
  }
  // Fora dos testes, um pequeno atraso entre os pedaços, para ver o streaming no app.
  return new LlmFake({ atrasoMs: config.ambiente === 'test' ? 0 : 40 });
}

/** Escolhe a transcrição pelo `TRANSCRICAO_PROVEDOR`. */
export function criarProvedorTranscricao(config: Configuracao): TranscricaoProvider {
  if (config.provedorTranscricao === 'deepgram') {
    const chave = config.chaveDeepgram;
    if (chave === undefined) {
      throw new Error('TRANSCRICAO_PROVEDOR=deepgram exige DEEPGRAM_CHAVE_API');
    }
    return new TranscricaoDeepgram(chave, config.modeloTranscricao);
  }
  if (config.ehProducao) {
    new Logger('IA').warn('TRANSCRICAO_PROVEDOR=fake em produção: os áudios viram um texto fixo.');
  }
  return new TranscricaoFake();
}

/** Provedores de IA (doc 08 e 10). */
@Module({
  providers: [
    { provide: LlmProvider, inject: [Configuracao], useFactory: criarProvedorLlm },
    { provide: TranscricaoProvider, inject: [Configuracao], useFactory: criarProvedorTranscricao },
  ],
  exports: [LlmProvider, TranscricaoProvider],
})
export class IaModule {}
