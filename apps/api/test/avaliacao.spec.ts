import { describe, expect, it, vi } from 'vitest';

import { ClockFixo } from '../src/core/clock/clock';
import type { Configuracao } from '../src/core/config/configuracao';
import { ErroDominio } from '../src/core/erros/erro-dominio';
import { conferir, type Observado } from '../src/modulos/mony/avaliacao/avaliador';
import { CASOS_AVALIACAO } from '../src/modulos/mony/avaliacao/casos';
import {
  CONFIG_LOCAL,
  ConfigMonyService,
  type ResultadoAvaliacao,
} from '../src/modulos/mony/config.service';
import type { RegistroFerramentas } from '../src/modulos/mony/ferramentas/registro';
import type { ConfigSalva, MonyRepository } from '../src/modulos/mony/mony.repository';
import { PROMPT_SISTEMA } from '../src/modulos/mony/prompts/sistema';

const observado = (extra: Partial<Observado> = {}): Observado => ({
  chamadas: [],
  componentes: [],
  texto: '',
  erro: null,
  ...extra,
});

describe('avaliação da Mony: conferir (T-068)', () => {
  it('ferramentas esperadas em qualquer ordem, com os argumentos que importam', () => {
    const espera = {
      ferramentas: [
        { nome: 'criar_transacao', args: { tipo: 'receita', valorCentavos: 350_000 } },
        { nome: ['consultar_cartao', 'listar_cartoes'] },
      ],
      semFerramentas: ['excluir_transacao'],
    };
    const certo = observado({
      chamadas: [
        { id: '1', nome: 'listar_cartoes', entrada: {} },
        {
          id: '2',
          nome: 'criar_transacao',
          entrada: { tipo: 'Receita', valorCentavos: 350_000, descricao: 'Salário' },
        },
      ],
    });
    expect(conferir(espera, certo)).toEqual([]);
    expect(
      conferir(
        espera,
        observado({
          chamadas: [
            { id: '1', nome: 'criar_transacao', entrada: { tipo: 'receita', valorCentavos: 3500 } },
            { id: '2', nome: 'excluir_transacao', entrada: {} },
          ],
        }),
      ),
    ).toEqual([
      'criar_transacao sem {"tipo":"receita","valorCentavos":350000} (veio {"tipo":"receita","valorCentavos":3500})',
      'faltou consultar_cartao ou listar_cartoes (veio criar_transacao, excluir_transacao)',
      'não podia chamar excluir_transacao',
    ]);
    expect(
      conferir(
        { ferramentas: [] },
        observado({ chamadas: [{ id: '1', nome: 'resumo_periodo', entrada: {} }] }),
      ),
    ).toEqual(['não esperava ferramentas e veio resumo_periodo']);
  });

  it('componente, pergunta, primeira opção, botões e o texto (sem acento, caixa e espaço especial)', () => {
    const pergunta = observado({
      componentes: [
        {
          tipo: 'botoes',
          opcoes: [
            {
              id: 'a',
              rotulo: 'Alimentação',
              acao: { tipo: 'rascunho', rascunhoId: 'r', campo: 'categoria', valor: 'a' },
            },
          ],
        },
      ],
      texto: 'Anotei R$ 32,90. Em qual categoria?',
    });
    expect(
      conferir(
        {
          componente: { tipo: 'botoes', pergunta: 'categoria', primeiraOpcao: 'Alimentação' },
          contem: ['anotei r$ 32,90', 'CATEGORIA'],
          naoContem: ['excluí'],
        },
        pergunta,
      ),
    ).toEqual([]);
    expect(
      conferir(
        {
          componente: {
            tipo: 'botoes',
            pergunta: 'forma_pagamento',
            primeiraOpcao: 'Mercado',
            acoes: ['desfazer'],
          },
          semComponente: true,
          contem: ['pix'],
          naoContem: ['qual categoria'],
        },
        pergunta,
      ),
    ).toEqual([
      'não esperava componente e veio botoes',
      'esperava a pergunta forma_pagamento e veio categoria',
      'esperava Mercado primeiro e veio Alimentação',
      'faltou o botão desfazer (veio a)',
      'o texto não diz "pix"',
      'o texto diz "qual categoria"',
    ]);
    expect(conferir({ componente: { tipo: 'resumo' } }, observado({ erro: 'HTTP 500' }))).toEqual([
      'erro: HTTP 500',
      'esperava componente resumo e veio nenhum',
    ]);
  });

  it('os casos têm ids únicos e há casos por regra e pelo modelo', () => {
    const ids = CASOS_AVALIACAO.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CASOS_AVALIACAO.some(({ regra }) => regra)).toBe(true);
    expect(CASOS_AVALIACAO.some(({ regra }) => !regra)).toBe(true);
  });
});

describe('ConfigMonyService (T-068)', () => {
  const clock = new ClockFixo('2026-10-15T15:00:00Z');
  const avaliacao = (percentual: number): ResultadoAvaliacao => ({
    total: 20,
    aprovados: Math.floor((percentual * 20) / 100),
    percentual,
    modelo: 'claude-sonnet-5-5',
    em: '2026-10-15T15:00:00.000Z',
    casos: [],
  });
  const salva = (extra: Partial<ConfigSalva> = {}): ConfigSalva => ({
    versao: 3,
    promptSistema: 'Prompt da versão 3.',
    ferramentas: { descricoes: { resumo_periodo: 'Resumo do mês.' } },
    modelo: 'claude-sonnet-5-5',
    ativo: true,
    avaliacao: null,
    ...extra,
  });

  function criar(repositorio: Partial<Record<keyof MonyRepository, unknown>>) {
    const registro = {
      paraModelo: () => [{ nome: 'resumo_periodo' }, { nome: 'criar_transacao' }],
    } as unknown as RegistroFerramentas;
    const configuracao = { modeloIa: 'claude-sonnet-5-5' } as unknown as Configuracao;
    return new ConfigMonyService(
      repositorio as unknown as MonyRepository,
      registro,
      configuracao,
      clock,
    );
  }

  it('a versão ativa vale, relida a cada minuto; sem versão, ou ilegível, vale o prompt do código', async () => {
    const configAtiva = vi.fn<() => Promise<ConfigSalva | null>>().mockResolvedValue(salva());
    const servico = criar({ configAtiva });

    expect(await servico.ativa()).toEqual({
      versao: 3,
      promptSistema: 'Prompt da versão 3.',
      descricoes: { resumo_periodo: 'Resumo do mês.' },
      modelo: 'claude-sonnet-5-5',
    });
    await servico.ativa();
    expect(configAtiva).toHaveBeenCalledTimes(1);

    expect(await criar({ configAtiva: () => Promise.resolve(null) }).ativa()).toBe(CONFIG_LOCAL);
    expect(CONFIG_LOCAL.promptSistema).toBe(PROMPT_SISTEMA);
    const ilegivel = criar({ configAtiva: () => Promise.resolve(salva({ ferramentas: [] })) });
    expect(await ilegivel.ativa()).toBe(CONFIG_LOCAL);
    const foraDoAr = criar({ configAtiva: () => Promise.reject(new Error('banco caiu')) });
    expect(await foraDoAr.ativa()).toBe(CONFIG_LOCAL);

    // A avaliação fixa outra configuração neste processo.
    servico.fixar(CONFIG_LOCAL);
    expect(await servico.ativa()).toBe(CONFIG_LOCAL);
    servico.fixar(null);
    expect((await servico.ativa()).versao).toBe(3);
  });

  it('só ativa com a avaliação de 95% ou mais', async () => {
    const ativarConfig = vi.fn(() => Promise.resolve());
    const com = (valor: unknown) =>
      criar({
        configDaVersao: () => Promise.resolve(salva({ ativo: false, avaliacao: valor })),
        ativarConfig,
      });
    await expect(com(null).ativar(3)).rejects.toThrow('ainda não passou pelas frases de teste');
    await expect(com(avaliacao(94)).ativar(3)).rejects.toThrow(
      'A versão 3 passou em 94% das frases de teste; o mínimo é 95%.',
    );
    expect(ativarConfig).not.toHaveBeenCalled();
    await com(avaliacao(95)).ativar(3);
    expect(ativarConfig).toHaveBeenCalledWith(3);
    await expect(
      criar({ configDaVersao: () => Promise.resolve(null) }).ativar(9),
    ).rejects.toBeInstanceOf(ErroDominio);
  });

  it('versão nova: prompt não vazio, só ferramentas que existem, e o modelo do ambiente por padrão', async () => {
    const criarConfig = vi.fn((dados: object) => Promise.resolve(salva({ versao: 4, ...dados })));
    const servico = criar({ criarConfig });
    await expect(
      servico.criarVersao({ promptSistema: 'Novo.', descricoes: { pagar_tudo: 'x' } }, null),
    ).rejects.toThrow('Ferramentas que não existem: pagar_tudo.');
    await expect(servico.criarVersao({ promptSistema: '  ' }, null)).rejects.toThrow(
      'O prompt está vazio.',
    );
    expect(
      await servico.criarVersao(
        { promptSistema: 'Novo.', descricoes: { criar_transacao: 'Grava.' } },
        'u1',
      ),
    ).toBe(4);
    expect(criarConfig).toHaveBeenCalledWith({
      promptSistema: 'Novo.',
      ferramentas: { descricoes: { criar_transacao: 'Grava.' } },
      modelo: 'claude-sonnet-5-5',
      criadoPorId: 'u1',
    });
  });
});
