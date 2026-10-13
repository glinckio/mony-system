/**
 * Teste grátis de 3 dias (T-101) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`): um teste
 * por pessoa no cadastro (RN-125), os avisos do 2º dia, do último e do fim pela rotina das 09:00,
 * no push e na Mony (RN-124), e o encerramento diário (RN-126). O relógio é fixo.
 */
import { createHash, randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { AlertasModule } from '../src/modulos/alertas/alertas.module';
import { AvaliadoresAlertas } from '../src/modulos/alertas/avaliadores-alertas';
import {
  type EnvioDeNotificacoes,
  EnvioNotificacoes,
} from '../src/modulos/notificacoes/envio-notificacoes';
import { TesteGratis } from '../src/modulos/planos/teste.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** Quinta, 15/10/2026, 12:00 em São Paulo: o teste vai até domingo, 18/10, 12:00. */
const AGORA = '2026-10-15T15:00:00Z';
/** 09:05 em São Paulo, a hora da rotina diária. */
const noDia = (data: string) => new Date(`${data}T12:05:00Z`);
const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

class EnvioAnotado extends EnvioNotificacoes {
  readonly envios: EnvioDeNotificacoes[] = [];

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.envios.push(envio);
    return Promise.resolve();
  }
}

describe.runIf(ativo)('integração: teste grátis de 3 dias', () => {
  let app: NestFastifyApplication;
  const relogio = new ClockFixo(AGORA);
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule, AlertasModule] })
      .overrideProvider(Clock)
      .useValue(relogio)
      .overrideProvider(EnvioNotificacoes)
      .useValue(new EnvioAnotado())
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    relogio.definir(AGORA);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function cadastrar(
    email = `teste-${randomUUID()}@exemplo.test`,
    aparelho = `aparelho-${randomUUID()}`,
  ) {
    return app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: aparelho, plataforma: 'ios' },
      },
    });
  }

  async function usuarioNovo(email?: string, aparelho?: string) {
    const resposta = await cadastrar(email, aparelho);
    expect(resposta.statusCode, resposta.body).toBe(201);
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  const assinatura = (usuario: Usuario) =>
    prisma.assinatura.findUniqueOrThrow({
      where: { usuarioId: usuario.usuarioId },
      select: { plano: true, testeInicio: true, testeFim: true },
    });

  const notificacoes = (usuario: Usuario) =>
    prisma.notificacao.findMany({
      where: { usuarioId: usuario.usuarioId },
      orderBy: { criadoEm: 'asc' },
      select: { tipo: true, chaveUnica: true, titulo: true, corpo: true, linkInterno: true },
    });

  const mensagensDaMony = async (usuario: Usuario) =>
    (
      await prisma.mensagem.findMany({
        where: { usuarioId: usuario.usuarioId, autor: 'mony' },
        orderBy: { criadoEm: 'asc' },
        select: { conteudo: true },
      })
    ).map(({ conteudo }) => conteudo);

  it('RN-006 RN-125 o teste de 3 dias começa no cadastro e marca o e-mail e o aparelho', async () => {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const aparelho = `aparelho-${randomUUID()}`;
    const usuario = await usuarioNovo(email, aparelho);
    expect(await assinatura(usuario)).toEqual({
      plano: 'teste',
      testeInicio: new Date(AGORA),
      testeFim: new Date('2026-10-18T15:00:00Z'),
    });
    const controles = await prisma.controleTeste.findMany({
      where: { valorHash: { in: [sha256(email), sha256(aparelho)] } },
      select: { tipo: true },
      orderBy: { tipo: 'asc' },
    });
    expect(controles).toEqual([{ tipo: 'email' }, { tipo: 'aparelho' }]);
  });

  it('RN-125 o mesmo aparelho não ganha outro teste: a conta nova entra no gratuito', async () => {
    const aparelho = `aparelho-${randomUUID()}`;
    const primeiro = await usuarioNovo(undefined, aparelho);
    expect((await assinatura(primeiro)).plano).toBe('teste');
    expect(await prisma.controleTeste.count({ where: { valorHash: sha256(aparelho) } })).toBe(1);

    const segundo = await usuarioNovo(undefined, aparelho);
    expect(await assinatura(segundo)).toEqual({
      plano: 'gratuito',
      testeInicio: null,
      testeFim: null,
    });
    const uso = await app.inject({
      method: 'GET',
      url: '/v1/assinatura/uso',
      headers: { authorization: `Bearer ${segundo.acesso}` },
    });
    expect(uso.json()).toMatchObject({ plano: 'gratuito', limitado: true });
  });

  it('RN-125 o e-mail vale pela caixa: outro +etiqueta ou pontos no Gmail não ganham outro teste', async () => {
    const nome = `ana${randomUUID().replaceAll('-', '')}`;
    const primeiro = await usuarioNovo(`${nome}@gmail.com`);
    expect((await assinatura(primeiro)).plano).toBe('teste');
    const pontos = `${nome.slice(0, 3)}.${nome.slice(3)}+mony@Gmail.com`;
    const segundo = await usuarioNovo(pontos);
    expect((await assinatura(segundo)).plano).toBe('gratuito');

    // Um e-mail que já teve teste (de uma conta excluída, por exemplo) também conta.
    const email = `teste-${randomUUID()}@exemplo.test`;
    await prisma.controleTeste.create({ data: { tipo: 'email', valorHash: sha256(email) } });
    expect((await assinatura(await usuarioNovo(email))).plano).toBe('gratuito');
  });

  it('RN-125 dois cadastros ao mesmo tempo no mesmo aparelho: só um teste', async () => {
    const aparelho = `aparelho-${randomUUID()}`;
    const respostas = await Promise.all([
      cadastrar(undefined, aparelho),
      cadastrar(undefined, aparelho),
    ]);
    expect(respostas.map(({ statusCode }) => statusCode)).toEqual([201, 201]);
    const planos = await Promise.all(
      respostas.map((resposta) =>
        assinatura({
          usuarioId: resposta.json<{ usuario: { id: string } }>().usuario.id,
          acesso: '',
        }),
      ),
    );
    expect(planos.map(({ plano }) => plano).sort()).toEqual(['gratuito', 'teste']);
  });

  it('RN-124 avisos no 2º dia e no último, com o que foi registrado, e no fim; push e Mony', async () => {
    const usuario = await usuarioNovo();
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId, tipo: 'despesa' },
    });
    for (const valorCentavos of [1_500, 3_000]) {
      const lancado = await app.inject({
        method: 'POST',
        url: '/v1/transacoes',
        headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
        payload: {
          tipo: 'despesa',
          descricao: 'Mercado',
          valorCentavos,
          categoriaId: categoria.id,
          formaPagamento: 'pix',
        },
      });
      expect(lancado.statusCode).toBe(201);
    }
    const avaliadores = app.get(AvaliadoresAlertas);

    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-15'));
    expect(await notificacoes(usuario)).toEqual([]);

    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-16'));
    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-16'));
    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-17'));
    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-18'));
    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-19'));
    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-20'));

    const despesas = 'R$ 45,00';
    // Segunda, 19/10, também sai o resumo da semana (T-083); aqui só os do teste.
    const doTeste = (await notificacoes(usuario)).filter(({ tipo }) => tipo === 'assinatura');
    expect(doTeste).toEqual([
      {
        tipo: 'assinatura',
        chaveUnica: 'assinatura:teste:segundo-dia',
        titulo: 'Seu 2º dia de teste grátis',
        corpo: `Até agora você registrou 2 lançamentos (${despesas} em despesas). Tudo está liberado até o fim do teste.`,
        linkInterno: 'mony://planos',
      },
      {
        tipo: 'assinatura',
        chaveUnica: 'assinatura:teste:ultimo-dia',
        titulo: 'Seu teste grátis acaba hoje às 12:00',
        corpo: `Você já registrou 2 lançamentos (${despesas} em despesas). Depois, o plano gratuito tem limites, e tudo o que você registrou continua aqui.`,
        linkInterno: 'mony://planos',
      },
      {
        tipo: 'assinatura',
        chaveUnica: 'assinatura:teste:fim',
        titulo: 'Seu teste grátis acabou',
        corpo:
          'Agora você está no plano gratuito, com limites por dia e por mês. Tudo o que você registrou continua aqui.',
        linkInterno: 'mony://planos',
      },
    ]);
    // A Mony também avisa, no chat.
    expect(
      (await mensagensDaMony(usuario)).filter((texto) => texto?.startsWith('Seu teste grátis')),
    ).toEqual([
      `Seu teste grátis está no 2º dia. Até agora você registrou 2 lançamentos (${despesas} em despesas). Tudo está liberado até o fim do teste.`,
      `Seu teste grátis acaba hoje às 12:00. Você já registrou 2 lançamentos (${despesas} em despesas). Depois, o plano gratuito tem limites, e tudo o que você registrou continua aqui.`,
      'Seu teste grátis acabou. Agora você está no plano gratuito, com limites por dia e por mês. Tudo o que você registrou continua aqui.',
    ]);
  });

  it('quem entrou direto no gratuito ou assinou não recebe os avisos do teste', async () => {
    const aparelho = `aparelho-${randomUUID()}`;
    await usuarioNovo(undefined, aparelho);
    const semTeste = await usuarioNovo(undefined, aparelho);
    const assinante = await usuarioNovo();
    await prisma.assinatura.update({
      where: { usuarioId: assinante.usuarioId },
      data: { plano: 'mensal' },
    });
    const avaliadores = app.get(AvaliadoresAlertas);
    for (const dia of ['2026-10-16', '2026-10-18', '2026-10-19']) {
      await avaliadores.avaliarDiario(semTeste.usuarioId, noDia(dia));
      await avaliadores.avaliarDiario(assinante.usuarioId, noDia(dia));
    }
    expect(await notificacoes(semTeste)).toEqual([]);
    expect(await notificacoes(assinante)).toEqual([]);
  });

  it('RN-126 a rotina diária passa para o gratuito o teste que acabou, e só ele', async () => {
    // Em 2020: a rotina pega todo o banco, e os outros arquivos de teste rodam ao mesmo tempo com
    // usuários em teste em 2026.
    relogio.definir('2020-01-01T15:00:00Z');
    const vencido = await usuarioNovo();
    const assinante = await usuarioNovo();
    await prisma.assinatura.update({
      where: { usuarioId: assinante.usuarioId },
      data: { plano: 'mensal' },
    });
    relogio.definir('2020-01-03T15:00:00Z');
    const novo = await usuarioNovo();

    // 01:15 de 05/01 em São Paulo: o primeiro acabou no dia 4; o outro só acaba no 6, às 12:00.
    const encerrar = () => app.get(TesteGratis).encerrar(new Date('2020-01-05T04:15:00Z'));
    expect(await encerrar()).toEqual({ encerrados: 1 });
    expect(await assinatura(vencido)).toMatchObject({
      plano: 'gratuito',
      testeFim: new Date('2020-01-04T15:00:00Z'),
    });
    expect((await assinatura(novo)).plano).toBe('teste');
    expect((await assinatura(assinante)).plano).toBe('mensal');
    // Rodar de novo não muda nada.
    expect(await encerrar()).toEqual({ encerrados: 0 });
  });
});
