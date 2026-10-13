import { Injectable, Logger } from '@nestjs/common';
import { LINKS_INTERNOS } from '@mony/shared/alertas';

import { Rotina } from '../../core/rotinas/rotinas';
import type { AlertaCandidato } from '../notificacoes/motor-alertas';
import { avisoDoTeste, textoDoAvisoDoTeste } from './dominio/teste';
import { TesteRepository } from './teste.repository';

/** A chave única de cada aviso do teste (RN-102: uma vez por pessoa). */
const CHAVE_DO_AVISO = {
  segundo_dia: 'assinatura:teste:segundo-dia',
  ultimo_dia: 'assinatura:teste:ultimo-dia',
  fim: 'assinatura:teste:fim',
} as const;

/**
 * Teste grátis de 3 dias (T-101): os avisos do 2º e do último dia e o do fim (RN-124), que a rotina
 * `alertas-diarios` manda às 09:00 de cada pessoa, e o encerramento do teste vencido (RN-126). O
 * controle de um teste por pessoa (RN-125) fica no cadastro.
 */
@Injectable()
export class TesteGratis {
  private readonly log = new Logger(TesteGratis.name);

  constructor(private readonly repositorio: TesteRepository) {}

  /**
   * RN-126 (doc 09): todo dia às 01:15, o teste que acabou sem plano escolhido passa para o
   * gratuito. Antes disso ele já vale como gratuito (`planoEfetivo`, T-100); a rotina grava.
   */
  @Rotina({ nome: 'encerrar-testes', padrao: '15 1 * * *' })
  async encerrar(agora: Date): Promise<{ encerrados: number }> {
    const encerrados = await this.repositorio.encerrarVencidos(agora);
    this.log.log(`Testes encerrados: ${String(encerrados)}`);
    return { encerrados };
  }

  /**
   * RN-124: o aviso do teste da pessoa na rodada das 09:00, se houver: push e mensagem da Mony,
   * com o que ela já registrou. O motor de alertas filtra e envia.
   */
  async avisos(usuarioId: string, agora: Date, fuso: string): Promise<AlertaCandidato[]> {
    const teste = await this.repositorio.teste(usuarioId);
    if (!teste?.testeFim) return [];
    const aviso = avisoDoTeste(teste, agora, fuso);
    if (aviso === null) return [];
    const texto = textoDoAvisoDoTeste(aviso, {
      testeFim: teste.testeFim,
      agora,
      fuso,
      resumo: await this.repositorio.resumo(usuarioId),
    });
    return [
      {
        usuarioId,
        tipo: 'assinatura',
        chaveUnica: CHAVE_DO_AVISO[aviso],
        // Aviso, não cobrança: espera o fim do horário de silêncio (RN-101).
        urgente: false,
        titulo: texto.titulo,
        corpo: texto.corpo,
        linkInterno: LINKS_INTERNOS.planos(),
        vaiParaChat: true,
        textoChat: texto.textoChat,
      },
    ];
  }
}
