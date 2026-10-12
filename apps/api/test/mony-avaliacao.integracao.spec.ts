/**
 * Prompt versionado e avaliação da Mony (T-068), com Postgres e Redis de verdade
 * (`TESTES_INTEGRACAO=1`): as frases resolvidas por regra passam com o modelo falso, e a versão
 * ativa de `mony_config` (prompt, descrições e modelo) é a que vai ao modelo.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { LlmFake } from '../src/integracoes/ia/llm-fake';
import { LlmProvider } from '../src/integracoes/ia/llm.provider';
import { avaliar } from '../src/modulos/mony/avaliacao/avaliador';
import { CASOS_AVALIACAO } from '../src/modulos/mony/avaliacao/casos';
import { ConfigMonyService } from '../src/modulos/mony/config.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: prompt versionado e avaliação da Mony', () => {
  let app: NestFastifyApplication;
  let modelo: LlmFake;
  let config: ConfigMonyService;
  const versoes: number[] = [];
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const llm = app.get(LlmProvider);
    if (!(llm instanceof LlmFake)) throw new Error('os testes usam IA_PROVEDOR=fake');
    modelo = llm;
    config = app.get(ConfigMonyService);
  });

  afterAll(async () => {
    await prisma.monyConfig.deleteMany({ where: { versao: { in: versoes } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('as frases resolvidas por regra passam todas, e os usuários da avaliação somem', async () => {
    const casos = CASOS_AVALIACAO.filter(({ regra }) => regra);
    const resultado = await avaliar(app, casos, 'fake');

    expect(resultado.casos.filter(({ passou }) => !passou)).toEqual([]);
    expect(resultado).toMatchObject({ total: casos.length, percentual: 100, modelo: 'fake' });
    expect(await prisma.usuario.count({ where: { email: { endsWith: '@mony.invalid' } } })).toBe(0);
  });

  it('a versão só ativa depois de passar, e a ativa é a que vai ao modelo', async () => {
    const versao = await config.criarVersao(
      {
        promptSistema: 'Você é a Mony, versão de teste.',
        descricoes: { resumo_periodo: 'Totais do período (versão de teste).' },
        modelo: 'claude-teste',
      },
      null,
    );
    versoes.push(versao);
    await expect(config.ativar(versao)).rejects.toThrow('ainda não passou pelas frases de teste');
    const resultado = {
      total: 20,
      aprovados: 18,
      percentual: 90,
      modelo: 'claude-teste',
      em: new Date().toISOString(),
      casos: [],
    };
    await config.registrarAvaliacao(versao, resultado);
    await expect(config.ativar(versao)).rejects.toThrow('passou em 90%');
    await config.registrarAvaliacao(versao, { ...resultado, aprovados: 20, percentual: 100 });
    await config.ativar(versao);
    expect(
      await prisma.monyConfig.findMany({ where: { ativo: true }, select: { versao: true } }),
    ).toEqual([{ versao }]);

    // A conversa usa a versão ativa: prompt, descrição da ferramenta e modelo.
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${String(randomInt(256))}.${String(randomInt(256))}.${String(randomInt(1, 255))}`,
      payload: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    const { usuario, tokens } = resposta.json<{
      usuario: { id: string };
      tokens: { acesso: string };
    }>();
    modelo.limpar();
    await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      headers: { authorization: `Bearer ${tokens.acesso}` },
      payload: { texto: 'como estou este mês?' },
    });
    const [pedido] = modelo.pedidos;
    expect(pedido?.sistema[0]).toBe('Você é a Mony, versão de teste.');
    expect(pedido?.modelo).toBe('claude-teste');
    expect(pedido?.ferramentas?.find(({ nome }) => nome === 'resumo_periodo')?.descricao).toBe(
      'Totais do período (versão de teste).',
    );
    expect(
      pedido?.ferramentas?.find(({ nome }) => nome === 'criar_transacao')?.descricao,
    ).toContain('Registra um gasto');
    // O falso não troca de modelo: o logs_ia diz o que respondeu.
    expect(
      await prisma.logIa.findMany({ where: { usuarioId: usuario.id }, select: { modelo: true } }),
    ).toEqual([{ modelo: 'fake' }]);

    await prisma.monyConfig.updateMany({ where: { versao }, data: { ativo: false } });
  });
});
