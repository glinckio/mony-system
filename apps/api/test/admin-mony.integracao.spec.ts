/**
 * A seção Mony do painel (T-141e) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`). Os
 * testes não ativam versão (a ativa vale para a conversa dos outros arquivos, que rodam ao mesmo
 * tempo) e põem os `logs_ia` em anos passados, para conferir só os deles.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type {
  CustoMonyAdmin,
  LogsMonyAdmin,
  PrecosIaAdmin,
  VersaoMonyAdmin,
  VersoesMonyAdmin,
} from '@mony/shared/admin';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { AdminMonyRepository } from '../src/modulos/admin/admin-mony.repository';
import {
  type ExecutorAvaliacao,
  ProcessadorAvaliacaoMony,
} from '../src/modulos/mony/avaliacao/pedidos-avaliacao';
import { ConfigMonyService } from '../src/modulos/mony/config.service';
import { PROMPT_SISTEMA } from '../src/modulos/mony/prompts/sistema';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: Mony no painel (T-141e)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let tokenAdmin = '';
  let adminId = '';
  let tokenApp = '';
  let usuarioApp = '';
  const versoes: number[] = [];

  const ip = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

  async function cadastrar(nome: string): Promise<{ id: string; acesso: string }> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: ip(),
      payload: {
        nome,
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    if (resposta.statusCode !== 201) throw new Error(resposta.body);
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { id: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  const chamar = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: object,
    token = tokenAdmin,
  ) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload }),
    });

  const criarVersao = async (promptSistema = `Você é a Mony, teste ${randomUUID()}.`) => {
    const resposta = await chamar('POST', '/v1/admin/mony/versoes', {
      promptSistema,
      descricoes: { resumo_periodo: 'Totais do período (teste do painel).' },
      modelo: 'claude-teste-painel',
    });
    expect(resposta.statusCode).toBe(201);
    const criada = resposta.json<VersaoMonyAdmin>();
    versoes.push(criada.versao);
    return criada;
  };

  /** Um processador com o processo da avaliação trocado por uma função. */
  const processador = (executar: ExecutorAvaliacao['executar']) =>
    new ProcessadorAvaliacaoMony({ executar }, app.get(PrismaService));

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const admin = await cadastrar('Ana Admin');
    adminId = admin.id;
    await prisma.usuario.update({ where: { id: adminId }, data: { papel: 'admin' } });
    tokenAdmin = (
      await app.get(TokensAcesso).emitirAdmin(adminId, randomUUID(), Math.floor(Date.now() / 1000))
    ).token;
    const pessoa = await cadastrar('Pessoa App');
    tokenApp = pessoa.acesso;
    usuarioApp = pessoa.id;
  });

  afterAll(async () => {
    await prisma.monyConfig.deleteMany({ where: { versao: { in: versoes } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [adminId, usuarioApp] } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('só admin entra na seção', async () => {
    expect((await chamar('GET', '/v1/admin/mony/versoes', undefined, tokenApp)).statusCode).toBe(
      403,
    );
  });

  it('cria versão inativa, mostra o prompt e não ativa sem avaliação; o modelo falso não avalia', async () => {
    const codigo = (await chamar('GET', '/v1/admin/mony/versoes/0')).json<VersaoMonyAdmin>();
    expect(codigo).toMatchObject({ versao: 0, promptSistema: PROMPT_SISTEMA, podeAtivar: false });

    const criada = await criarVersao('Você é a Mony, versão do painel.');
    expect(criada).toMatchObject({
      ativa: false,
      modelo: 'claude-teste-painel',
      situacaoAvaliacao: 'nunca',
      avaliacao: null,
      podeAtivar: false,
      promptSistema: 'Você é a Mony, versão do painel.',
      descricoes: { resumo_periodo: 'Totais do período (teste do painel).' },
      criadoPor: { id: adminId, nome: 'Ana Admin' },
    });

    const lista = (await chamar('GET', '/v1/admin/mony/versoes')).json<VersoesMonyAdmin>();
    expect(lista).toMatchObject({ minimoAvaliacao: 95, avaliacaoDisponivel: false });
    expect(lista.itens.find(({ versao }) => versao === criada.versao)).toMatchObject({
      situacaoAvaliacao: 'nunca',
    });
    expect(lista.itens).not.toHaveProperty('0.promptSistema');

    const ativar = await chamar('POST', `/v1/admin/mony/versoes/${criada.versao}/ativar`);
    expect(ativar.statusCode).toBe(409);
    expect(ativar.body).toContain('ainda não passou pelas frases de teste');

    const avaliar = await chamar('POST', `/v1/admin/mony/versoes/${criada.versao}/avaliar`);
    expect(avaliar.statusCode).toBe(409);
    expect(avaliar.body).toContain('modelo falso');

    const ferramentaQueNaoExiste = await chamar('POST', '/v1/admin/mony/versoes', {
      promptSistema: 'Prompt',
      descricoes: { nao_existe: 'x' },
      modelo: null,
    });
    expect(ferramentaQueNaoExiste.statusCode).toBe(400);
    expect((await chamar('GET', '/v1/admin/mony/versoes/999999')).statusCode).toBe(404);

    expect(
      await prisma.registroAuditoria.findFirst({
        where: {
          usuarioId: adminId,
          acao: 'mony.versao_criada',
          entidadeId: String(criada.versao),
        },
        select: { depois: true },
      }),
    ).toMatchObject({ depois: { versao: criada.versao, modelo: 'claude-teste-painel' } });
  });

  it('o pedido de avaliação trava a versão até o worker gravar o resultado ou a falha', async () => {
    const { versao } = await criarVersao();
    const repositorio = app.get(AdminMonyRepository);
    const pedir = (agora: Date) =>
      repositorio.pedirAvaliacao({
        versao,
        agora,
        livreAntesDe: new Date(agora.getTime() - 45 * 60_000),
        adminId,
        ip: '10.0.0.1',
      });
    const detalhe = async () =>
      (await chamar('GET', `/v1/admin/mony/versoes/${versao}`)).json<VersaoMonyAdmin>();

    const primeiro = new Date();
    expect(await pedir(primeiro)).toBe(true);
    expect(await pedir(new Date())).toBe(false);
    expect(await detalhe()).toMatchObject({ situacaoAvaliacao: 'em_andamento' });

    // O processo grava 100%: concluída e pronta para ativar.
    await processador(async () => {
      await app.get(ConfigMonyService).registrarAvaliacao(versao, {
        total: 2,
        aprovados: 2,
        percentual: 100,
        modelo: 'claude-teste-painel',
        em: new Date().toISOString(),
        casos: [
          { id: 'gasto-simples', passou: true, motivos: [] },
          { id: 'receita', passou: true, motivos: [] },
        ],
      });
      return { codigo: 0, saida: '2 de 2 (100%); mínimo 95%.' };
    }).process({ data: { versao, pedidaEm: primeiro.toISOString() } } as never);
    expect(await detalhe()).toMatchObject({
      situacaoAvaliacao: 'concluida',
      avaliacao: { percentual: 100, total: 2 },
      podeAtivar: true,
      avaliacaoFalha: null,
      casos: [{ id: 'gasto-simples', passou: true }, { id: 'receita' }],
    });

    // Um pedido novo cujo processo não grava nada: falha com a última linha, e o resultado
    // anterior continua.
    const segundo = new Date(Date.now() + 1000);
    expect(await pedir(segundo)).toBe(true);
    await processador(() =>
      Promise.resolve({
        codigo: 1,
        saida: 'Avaliando...\nFalha na avaliação da Mony: sem rede\n',
      }),
    ).process({ data: { versao, pedidaEm: segundo.toISOString() } } as never);
    expect(await detalhe()).toMatchObject({
      situacaoAvaliacao: 'falhou',
      avaliacaoFalha: 'Falha na avaliação da Mony: sem rede',
      avaliacao: { percentual: 100 },
      podeAtivar: true,
    });
    // Depois da falha, pode pedir de novo.
    expect(await pedir(new Date(Date.now() + 2000))).toBe(true);
    expect(await detalhe()).toMatchObject({ situacaoAvaliacao: 'em_andamento' });
  });

  it('lista as chamadas com erro do período com a mensagem e grava auditoria', async () => {
    // Um ano qualquer do século passado: os logs de outra rodada não entram na página.
    const ano = String(1900 + randomInt(1, 100));
    const em = (dia: string) => new Date(`${dia}T15:00:00Z`);
    const base = { usuarioId: usuarioApp, tokensEntrada: 10, tokensSaida: 5, duracaoMs: 800 };
    await prisma.logIa.createMany({
      data: [
        {
          ...base,
          modelo: 'm-log',
          erro: 'timeout',
          ferramenta: 'resumo_periodo',
          criadoEm: em(`${ano}-03-10`),
        },
        { ...base, modelo: 'm-log', erro: 'overloaded', criadoEm: em(`${ano}-03-11`) },
        { ...base, modelo: 'm-log', erro: null, criadoEm: em(`${ano}-03-11`) },
        { ...base, modelo: 'm-log', erro: 'fora do período', criadoEm: em(`${ano}-04-01`) },
      ],
    });
    const pagina = (
      await chamar('GET', `/v1/admin/mony/logs?de=${ano}-03-01&ate=${ano}-03-31&limite=1`)
    ).json<LogsMonyAdmin>();
    expect(pagina.itens).toMatchObject([
      { erro: 'overloaded', usuario: { id: usuarioApp, nome: 'Pessoa App' }, mensagem: null },
    ]);
    expect(pagina.proximoCursor).not.toBeNull();
    const segunda = (
      await chamar(
        'GET',
        `/v1/admin/mony/logs?de=${ano}-03-01&ate=${ano}-03-31&limite=1&cursor=${pagina.proximoCursor ?? ''}`,
      )
    ).json<LogsMonyAdmin>();
    expect(segunda).toMatchObject({
      itens: [{ erro: 'timeout', ferramenta: 'resumo_periodo', duracaoMs: 800 }],
      proximoCursor: null,
    });
    expect(
      await prisma.registroAuditoria.count({
        where: { usuarioId: adminId, acao: 'mony.logs_vistos' },
      }),
    ).toBe(2);
  });

  it('custo por modelo pela tabela de preços; modelo sem preço fica de fora do total', async () => {
    const comPreco = `m-preco-${randomUUID().slice(0, 8)}`;
    const semPreco = `m-sem-${randomUUID().slice(0, 8)}`;
    const em = new Date('2002-06-15T15:00:00Z');
    const base = { usuarioId: usuarioApp, duracaoMs: 100, criadoEm: em };
    await prisma.logIa.createMany({
      data: [
        { ...base, modelo: comPreco, tokensEntrada: 1_000_000, tokensSaida: 200_000 },
        { ...base, modelo: comPreco, tokensEntrada: 500_000, tokensSaida: 0, erro: 'x' },
        { ...base, modelo: semPreco, tokensEntrada: 10, tokensSaida: 10 },
      ],
    });

    const antes = (await chamar('GET', '/v1/admin/mony/precos')).json<PrecosIaAdmin>();
    try {
      const salvos = await chamar('PUT', '/v1/admin/mony/precos', {
        precos: [
          ...antes.precos.filter(({ modelo }) => modelo !== comPreco),
          { modelo: comPreco, entradaCentavosPorMilhao: 300, saidaCentavosPorMilhao: 1500 },
        ],
      });
      expect(salvos.statusCode).toBe(200);

      const custo = (
        await chamar('GET', '/v1/admin/mony/custo?de=2002-06-15&ate=2002-06-15')
      ).json<CustoMonyAdmin>();
      const doModelo = (nome: string) => custo.modelos.find(({ modelo }) => modelo === nome);
      // 1,5 M de entrada a US$ 3,00 e 0,2 M de saída a US$ 15,00: US$ 4,50 + US$ 3,00.
      expect(doModelo(comPreco)).toEqual({
        modelo: comPreco,
        chamadas: 2,
        tokensEntrada: 1_500_000,
        tokensSaida: 200_000,
        custoCentavos: 750,
      });
      expect(doModelo(semPreco)).toMatchObject({ chamadas: 1, custoCentavos: null });
      expect(custo.modelosSemPreco).toContain(semPreco);
      expect(custo.chamadasComErro).toBeGreaterThanOrEqual(1);

      const repetido = await chamar('PUT', '/v1/admin/mony/precos', {
        precos: [
          { modelo: comPreco, entradaCentavosPorMilhao: 1, saidaCentavosPorMilhao: 1 },
          { modelo: comPreco, entradaCentavosPorMilhao: 2, saidaCentavosPorMilhao: 2 },
        ],
      });
      expect(repetido.statusCode).toBe(400);
      expect(
        (await chamar('GET', '/v1/admin/mony/custo?de=2001-01-01&ate=2002-06-15')).statusCode,
      ).toBe(400);
      expect(
        await prisma.registroAuditoria.findFirst({
          where: { usuarioId: adminId, acao: 'mony.precos_alterados' },
          select: { depois: true },
        }),
      ).toMatchObject({
        depois: {
          precos: expect.arrayContaining([
            expect.objectContaining({ modelo: comPreco }),
          ]) as unknown,
        },
      });
    } finally {
      await chamar('PUT', '/v1/admin/mony/precos', antes);
    }
  });
});
