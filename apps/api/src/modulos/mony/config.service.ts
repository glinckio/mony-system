import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { Clock } from '../../core/clock/clock';
import { Configuracao } from '../../core/config/configuracao';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { RegistroFerramentas } from './ferramentas/registro';
import { type ConfigSalva, MonyRepository } from './mony.repository';
import { PROMPT_SISTEMA } from './prompts/sistema';

/** Doc 08: a versão só ativa com 95% ou mais das frases de teste passando (decisão técnica). */
export const MINIMO_AVALIACAO = 95;
/** A versão ativa é relida a cada minuto: ativar vale em todas as instâncias sem reiniciar. */
const CACHE_CONFIG_MS = 60_000;

/** O que a conversa usa: o prompt do sistema, as descrições das ferramentas e o modelo. */
export interface ConfigMony {
  /** `null`: o prompt local, sem versão ativa em `mony_config`. */
  versao: number | null;
  promptSistema: string;
  /** Descrição de cada ferramenta que muda; as outras ficam com a do código. */
  descricoes: Readonly<Record<string, string>>;
  /** `null`: o modelo do ambiente (`IA_MODELO`). */
  modelo: string | null;
}

/** O prompt e as descrições do código: valem quando não há versão ativa. */
export const CONFIG_LOCAL: ConfigMony = {
  versao: null,
  promptSistema: PROMPT_SISTEMA,
  descricoes: {},
  modelo: null,
};

/** `mony_config.ferramentas`: as descrições por nome de ferramenta. */
const esquemaFerramentasConfig = z.object({
  descricoes: z.record(z.string(), z.string().trim().min(1).max(2000)),
});

/** O resultado das frases de teste com uma versão (`mony_config.avaliacao`). */
export const esquemaResultadoAvaliacao = z.object({
  total: z.number().int(),
  aprovados: z.number().int(),
  /** Inteiro, para baixo. */
  percentual: z.number().int(),
  modelo: z.string(),
  em: z.iso.datetime(),
  casos: z.array(z.object({ id: z.string(), passou: z.boolean(), motivos: z.array(z.string()) })),
});

export type ResultadoAvaliacao = z.infer<typeof esquemaResultadoAvaliacao>;

export interface NovaVersaoMony {
  promptSistema: string;
  descricoes?: Readonly<Record<string, string>>;
  /** Sem modelo, vale o do ambiente. */
  modelo?: string;
}

/**
 * Prompt versionado da Mony (doc 08, T-068): a versão ativa de `mony_config` (prompt do sistema,
 * descrições das ferramentas e modelo) vale na conversa; sem versão ativa, ou com uma que não se
 * lê, vale o prompt do código. Uma versão nova só ativa depois de passar nas frases de teste.
 */
@Injectable()
export class ConfigMonyService {
  private readonly log = new Logger(ConfigMonyService.name);
  private cache: { config: ConfigMony; ate: number } | null = null;
  private fixada: ConfigMony | null = null;

  constructor(
    private readonly repositorio: MonyRepository,
    private readonly ferramentas: RegistroFerramentas,
    private readonly configuracao: Configuracao,
    private readonly clock: Clock,
  ) {}

  /** A configuração da conversa agora. Banco fora do ar: a última lida, ou a local. */
  async ativa(): Promise<ConfigMony> {
    if (this.fixada) return this.fixada;
    const agora = this.clock.agora().getTime();
    if (this.cache && this.cache.ate > agora) return this.cache.config;
    let config: ConfigMony;
    try {
      const salva = await this.repositorio.configAtiva();
      config = salva === null ? CONFIG_LOCAL : (this.lerConfig(salva) ?? CONFIG_LOCAL);
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.log.warn(`Configuração da Mony não lida: ${motivo}`);
      config = this.cache?.config ?? CONFIG_LOCAL;
    }
    this.cache = { config, ate: agora + CACHE_CONFIG_MS };
    return config;
  }

  /** Uma versão, ativa ou não (para avaliar antes de ativar). */
  async daVersao(versao: number): Promise<ConfigMony> {
    const salva = await this.repositorio.configDaVersao(versao);
    if (!salva) throw new ErroDominio('NAO_ENCONTRADO');
    const config = this.lerConfig(salva);
    if (!config) {
      throw new ErroDominio('CONFLITO', { mensagem: `A versão ${String(versao)} não se lê.` });
    }
    return config;
  }

  /**
   * Usa esta configuração no lugar da ativa, neste processo: a avaliação de uma versão antes de
   * ativar e os testes. `null` volta para a ativa.
   */
  fixar(config: ConfigMony | null): void {
    this.fixada = config;
  }

  /** Grava a próxima versão, inativa. As descrições só valem para ferramentas que existem. */
  async criarVersao(dados: NovaVersaoMony, criadoPorId: string | null): Promise<number> {
    const nomes = new Set(this.ferramentas.paraModelo().map(({ nome }) => nome));
    const descricoes = dados.descricoes ?? {};
    const desconhecidas = Object.keys(descricoes).filter((nome) => !nomes.has(nome));
    if (desconhecidas.length > 0) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: `Ferramentas que não existem: ${desconhecidas.join(', ')}.`,
      });
    }
    if (dados.promptSistema.trim() === '') {
      throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'O prompt está vazio.' });
    }
    const salva = await this.repositorio.criarConfig({
      promptSistema: dados.promptSistema,
      ferramentas: { descricoes },
      modelo: dados.modelo ?? this.configuracao.modeloIa,
      criadoPorId,
    });
    return salva.versao;
  }

  async registrarAvaliacao(versao: number, resultado: ResultadoAvaliacao): Promise<void> {
    if (!(await this.repositorio.configDaVersao(versao))) throw new ErroDominio('NAO_ENCONTRADO');
    await this.repositorio.salvarAvaliacaoConfig(versao, resultado);
  }

  /** Ativa a versão se a avaliação dela passou (doc 08); a anterior sai. */
  async ativar(versao: number): Promise<void> {
    const salva = await this.repositorio.configDaVersao(versao);
    if (!salva) throw new ErroDominio('NAO_ENCONTRADO');
    if (!this.lerConfig(salva)) {
      throw new ErroDominio('CONFLITO', { mensagem: `A versão ${String(versao)} não se lê.` });
    }
    const avaliacao = esquemaResultadoAvaliacao.safeParse(salva.avaliacao);
    if (!avaliacao.success) {
      throw new ErroDominio('CONFLITO', {
        mensagem: `A versão ${String(versao)} ainda não passou pelas frases de teste.`,
      });
    }
    if (avaliacao.data.percentual < MINIMO_AVALIACAO) {
      throw new ErroDominio('CONFLITO', {
        mensagem: `A versão ${String(versao)} passou em ${String(avaliacao.data.percentual)}% das frases de teste; o mínimo é ${String(MINIMO_AVALIACAO)}%.`,
      });
    }
    await this.repositorio.ativarConfig(versao);
    this.cache = null;
  }

  private lerConfig(salva: ConfigSalva): ConfigMony | null {
    const ferramentas = esquemaFerramentasConfig.safeParse(salva.ferramentas);
    if (!ferramentas.success || salva.promptSistema.trim() === '') {
      this.log.warn(`Versão ${String(salva.versao)} da Mony não se lê; vale o prompt local.`);
      return null;
    }
    return {
      versao: salva.versao,
      promptSistema: salva.promptSistema,
      descricoes: ferramentas.data.descricoes,
      modelo: salva.modelo,
    };
  }
}
