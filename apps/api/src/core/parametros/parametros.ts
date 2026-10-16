import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { esquemaParametros, MONITORAMENTO_PADRAO, type Parametros } from '@mony/shared/admin';
import { PARAMETROS_FORA_DO_PADRAO } from '@mony/shared/alertas';
import { COTA_CONSULTORIA_DIARIA } from '@mony/shared/notificacoes';

import { Clock } from '../clock/clock';
import { Configuracao } from '../config/configuracao';
import { PrismaService } from '../prisma/prisma.service';

/** `configuracoes.chave` dos parâmetros do painel (T-141g). */
export const CONFIGURACAO_PARAMETROS = 'parametros';

/** Por quanto tempo cada processo usa o que leu antes de ler de novo. */
export const VALIDADE_PARAMETROS_MS = 30_000;

/** RN-104 (PDF): 1 alerta por dia por app de compra. */
export const INTERVALO_APP_COMPRA_HORAS = 24;
/** RN-078 (sugestão do doc, confirmar com cliente): 10 ligações por mês. */
export const LIMITE_LIGACOES_MENSAL = 10;

/** Os padrões: os do código e, na versão mínima, os do ambiente. */
export function parametrosPadrao(config: Configuracao): Parametros {
  return {
    alertas: {
      cotaConsultoriaDiaria: COTA_CONSULTORIA_DIARIA,
      intervaloAppCompraHoras: INTERVALO_APP_COMPRA_HORAS,
      foraDoPadrao: {
        multiplo: PARAMETROS_FORA_DO_PADRAO.multiplo,
        minimoDeLancamentos: PARAMETROS_FORA_DO_PADRAO.minimoDeLancamentos,
        valorMinimoCentavos: PARAMETROS_FORA_DO_PADRAO.valorMinimoCentavos,
      },
    },
    ligacoes: { limiteMensal: LIMITE_LIGACOES_MENSAL },
    versaoMinima: { ...config.versoesMinimasApp },
    monitoramento: { ...MONITORAMENTO_PADRAO },
  };
}

/**
 * Os grupos que faltam numa linha salva antes de eles existirem (ex.: `monitoramento`, T-142a)
 * entram com o padrão; os que estão lá ficam como estão.
 */
export function completarComPadroes(valor: unknown, padrao: Parametros): unknown {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return valor;
  return { ...padrao, ...valor };
}

/**
 * Os parâmetros que o painel edita (doc 13), para a API e o worker. Cada processo guarda o que
 * leu por 30 s: uma mudança no painel vale em todos em até meio minuto. Sem linha (ou com uma que
 * não se lê) valem os padrões; com o banco fora, também, sem derrubar a requisição.
 */
@Injectable()
export class ParametrosService {
  private readonly log = new Logger(ParametrosService.name);
  private guardados: { valor: Parametros; ate: number } | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: Configuracao,
    private readonly clock: Clock,
  ) {}

  async obter(): Promise<Parametros> {
    const agora = this.clock.agora().getTime();
    if (this.guardados && this.guardados.ate > agora) return this.guardados.valor;
    const valor = await this.ler();
    this.guardados = { valor, ate: agora + VALIDADE_PARAMETROS_MS };
    return valor;
  }

  /** Depois de salvar, este processo lê de novo na próxima chamada. */
  esquecer(): void {
    this.guardados = undefined;
  }

  padrao(): Parametros {
    return parametrosPadrao(this.config);
  }

  private async ler(): Promise<Parametros> {
    try {
      const linha = await this.prisma.cliente.configuracao.findUnique({
        where: { chave: CONFIGURACAO_PARAMETROS },
        select: { valor: true },
      });
      if (!linha) return this.padrao();
      const lidos = esquemaParametros.safeParse(completarComPadroes(linha.valor, this.padrao()));
      if (lidos.success) return lidos.data;
      this.log.error('configuracoes.parametros não segue o esquema; valem os padrões');
    } catch (erro) {
      this.log.warn(`Sem ler os parâmetros (${(erro as Error).message}); valem os padrões`);
    }
    return this.padrao();
  }
}

@Global()
@Module({ providers: [ParametrosService], exports: [ParametrosService] })
export class ParametrosModule {}
