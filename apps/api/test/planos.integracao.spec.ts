/**
 * Cotas do plano gratuito (T-100) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`): a conta
 * atômica em `uso_recursos` no fuso do usuário, o erro `LIMITE_PLANO_ATINGIDO`, o limite de
 * cartões, os relatórios do mês, `GET /assinatura/uso` e o aviso da Mony com [Ver planos]. O
 * relógio é fixo (15/10/2026, 12h em São Paulo) e o modelo é o falso.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { RecursoPlano } from '@mony/shared/enums';
import { type EventoMony, eventoMonyDoSse, LeitorSse } from '@mony/shared/mony';
import type { UsoPlano } from '@mony/shared/planos';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { LIMITES_PLANO_PADRAO } from '../src/core/dados-iniciais/padroes';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { LlmFake } from '../src/integracoes/ia/llm-fake';
import { LlmProvider } from '../src/integracoes/ia/llm.provider';
import { botaoVerPlanos } from '../src/modulos/mony/aviso-limite';
import { CONFIG_LOCAL, ConfigMonyService } from '../src/modulos/mony/config.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';
const AGORA = '2026-10-15T15:00:00Z';
const DIA_MS = 24 * 60 * 60 * 1000;

const LIMITE_DO_DIA =
  'Você chegou ao limite de 3 lançamentos por dia do plano gratuito. Amanhã libera de novo.';

describe.runIf(ativo)('integração: cotas do plano gratuito', () => {
  let app: NestFastifyApplication;
  let modelo: LlmFake;
  const relogio = new ClockFixo(AGORA);
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    // Os limites padrão (RN-120), como o seed grava; não mexe no que já existe.
    for (const limite of LIMITES_PLANO_PADRAO) {
      await prisma.limitePlano.upsert({
        where: { recurso: limite.recurso },
        create: limite,
        update: {},
      });
    }
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(relogio)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    app.get(ConfigMonyService).fixar(CONFIG_LOCAL);
    const provedor = app.get(LlmProvider);
    if (!(provedor instanceof LlmFake)) throw new Error('os testes usam IA_PROVEDOR=fake');
    modelo = provedor;
  });

  beforeEach(() => {
    modelo.limpar();
    relogio.definir(AGORA);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Cadastro (que começa no teste de 3 dias) e, por padrão, a passagem para o gratuito. */
  async function usuarioNovo(plano: 'gratuito' | 'teste' = 'gratuito') {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    const usuarioId = sessao.usuario.id;
    const [, corpo = ''] = sessao.tokens.acesso.split('.');
    const { sid, did } = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as {
      sid: string;
      did?: string;
    };
    if (plano === 'gratuito') await virarGratuito(usuarioId);
    const categorias = await prisma.categoria.findMany({
      where: { usuarioId },
      orderBy: { nome: 'asc' },
    });
    const de = (tipo: string) => categorias.find((categoria) => categoria.tipo === tipo)?.id ?? '';
    return {
      usuarioId,
      sessaoId: sid,
      dispositivoId: did ?? null,
      despesa: de('despesa'),
      receita: de('receita'),
    };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  const virarGratuito = (usuarioId: string) =>
    prisma.assinatura.update({
      where: { usuarioId },
      data: { plano: 'gratuito', testeInicio: null, testeFim: null },
    });

  /** Um token de acesso no instante do relógio (o de 15 minutos venceria quando ele anda). */
  async function autorizacao(usuario: Usuario) {
    const { token } = await app.get(TokensAcesso).emitir({
      id: usuario.usuarioId,
      papel: 'usuario',
      sessaoId: usuario.sessaoId,
      dispositivoId: usuario.dispositivoId,
    });
    return { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() };
  }

  async function chamar(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: await autorizacao(usuario),
      ...(payload === undefined ? {} : { payload }),
    });
  }

  const lancar = (usuario: Usuario, extra: Record<string, unknown> = {}) =>
    chamar(usuario, 'POST', '/transacoes', {
      tipo: 'despesa',
      descricao: 'Mercado',
      valorCentavos: 1_500,
      categoriaId: usuario.despesa,
      formaPagamento: 'pix',
      ...extra,
    });

  const cartao = (usuario: Usuario, nome: string) =>
    chamar(usuario, 'POST', '/cartoes', {
      nome,
      limiteTotalCentavos: 300_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#7C3AED',
    });

  /** Uso já registrado num dia (para chegar perto do limite sem gravar tudo). */
  const usado = (usuario: Usuario, recurso: RecursoPlano, quantidade: number, data: string) =>
    prisma.usoRecurso.create({
      data: {
        usuarioId: usuario.usuarioId,
        recurso: recurso as 'lancamento',
        data: new Date(`${data}T00:00:00Z`),
        quantidade,
      },
    });

  const usoDe = async (usuario: Usuario, recurso: RecursoPlano) =>
    (
      await prisma.usoRecurso.findMany({
        where: { usuarioId: usuario.usuarioId, recurso: recurso as 'lancamento' },
        orderBy: { data: 'asc' },
      })
    ).map(({ data, quantidade }) => [data.toISOString().slice(0, 10), quantidade]);

  const transacoesDe = (usuario: Usuario) =>
    prisma.transacao.count({ where: { usuarioId: usuario.usuarioId, excluidoEm: null } });

  async function conversar(usuario: Usuario, texto: string) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      headers: await autorizacao(usuario),
      payload: { texto },
    });
    const eventos = new LeitorSse()
      .ler(resposta.body)
      .map(eventoMonyDoSse)
      .filter((evento): evento is EventoMony => evento !== null);
    return {
      eventos,
      texto: eventos
        .flatMap((evento) => (evento.tipo === 'texto.delta' ? [evento.texto] : []))
        .join(''),
      componentes: eventos.flatMap((evento) =>
        evento.tipo === 'componente' ? [evento.componente] : [],
      ),
    };
  }

  it('RN-120 RN-122 RN-123 três lançamentos por dia: o quarto não grava, diz quando volta e volta amanhã', async () => {
    const usuario = await usuarioNovo();
    for (let vez = 0; vez < 3; vez += 1) expect((await lancar(usuario)).statusCode).toBe(201);

    const quarto = await lancar(usuario);
    expect(quarto.statusCode).toBe(403);
    expect(quarto.json()).toEqual({
      erro: {
        codigo: 'LIMITE_PLANO_ATINGIDO',
        mensagem: LIMITE_DO_DIA,
        detalhes: {
          recurso: 'lancamento',
          periodo: 'dia',
          limite: 3,
          renovaEm: '2026-10-16T03:00:00.000Z',
        },
      },
    });
    // Nada gravado além dos três, e a conta é uma linha por dia no fuso do usuário.
    expect(await transacoesDe(usuario)).toBe(3);
    expect(await usoDe(usuario, 'lancamento')).toEqual([['2026-10-15', 3]]);

    // 21h em São Paulo ainda é o mesmo dia; à meia-noite, volta.
    relogio.definir('2026-10-16T00:30:00Z');
    expect((await lancar(usuario)).statusCode).toBe(403);
    relogio.definir('2026-10-16T03:00:00Z');
    expect((await lancar(usuario)).statusCode).toBe(201);
    expect(await usoDe(usuario, 'lancamento')).toEqual([
      ['2026-10-15', 3],
      ['2026-10-16', 1],
    ]);
  });

  it('RN-122 pedidos ao mesmo tempo não passam do limite', async () => {
    const usuario = await usuarioNovo();
    const respostas = await Promise.all(Array.from({ length: 6 }, () => lancar(usuario)));
    const status = respostas.map(({ statusCode }) => statusCode).sort();
    expect(status).toEqual([201, 201, 201, 403, 403, 403]);
    expect(await transacoesDe(usuario)).toBe(3);
    expect(await usoDe(usuario, 'lancamento')).toEqual([['2026-10-15', 3]]);
  });

  it('RN-120 trinta por mês: conta do dia 1º a hoje; o mês passado não conta', async () => {
    const usuario = await usuarioNovo();
    await usado(usuario, 'lancamento', 50, '2026-09-30');
    await usado(usuario, 'lancamento', 29, '2026-10-01');
    expect((await lancar(usuario)).statusCode).toBe(201);

    const resposta = await lancar(usuario);
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: { mensagem: string; detalhes: unknown } }>().erro).toEqual({
      codigo: 'LIMITE_PLANO_ATINGIDO',
      mensagem:
        'Você chegou ao limite de 30 lançamentos por mês do plano gratuito. No mês que vem libera de novo.',
      detalhes: {
        recurso: 'lancamento',
        periodo: 'mes',
        limite: 30,
        renovaEm: '2026-11-01T03:00:00.000Z',
      },
    });
  });

  it('RN-120 parcelamento e recorrência contam um lançamento cada; editar não conta', async () => {
    const usuario = await usuarioNovo();
    const parcelamento = await chamar(usuario, 'POST', '/parcelamentos', {
      tipo: 'divida',
      nome: 'Empréstimo',
      valorCentavos: 120_000,
      totalParcelas: 12,
      categoriaId: usuario.despesa,
    });
    expect(parcelamento.statusCode, parcelamento.body).toBe(201);
    const recorrencia = await chamar(usuario, 'POST', '/recorrencias', {
      tipo: 'despesa',
      descricao: 'Aluguel',
      valorCentavos: 150_000,
      categoriaId: usuario.despesa,
      formaPagamento: 'boleto',
      frequencia: 'mensal',
      dataInicio: '2026-10-05',
    });
    expect(recorrencia.statusCode, recorrencia.body).toBe(201);
    expect(await usoDe(usuario, 'lancamento')).toEqual([['2026-10-15', 2]]);

    const gravada = await lancar(usuario);
    expect(gravada.statusCode).toBe(201);
    const { transacao } = gravada.json<{ transacao: { id: string } }>();
    const editada = await chamar(usuario, 'PATCH', `/transacoes/${transacao.id}`, {
      descricao: 'Feira',
    });
    expect(editada.statusCode).toBe(200);
    expect(await usoDe(usuario, 'lancamento')).toEqual([['2026-10-15', 3]]);

    const outro = await chamar(usuario, 'POST', '/parcelamentos', {
      tipo: 'divida',
      nome: 'Outro',
      valorCentavos: 10_000,
      totalParcelas: 2,
      categoriaId: usuario.despesa,
    });
    expect(outro.statusCode).toBe(403);
    expect(await prisma.parcelamento.count({ where: { usuarioId: usuario.usuarioId } })).toBe(1);
  });

  it('RN-126 no teste, tudo liberado; o teste que acabou já é o gratuito', async () => {
    const usuario = await usuarioNovo('teste');
    for (let vez = 0; vez < 4; vez += 1) expect((await lancar(usuario)).statusCode).toBe(201);
    // No teste nada é contado.
    expect(await usoDe(usuario, 'lancamento')).toEqual([]);

    const uso = await chamar(usuario, 'GET', '/assinatura/uso');
    expect(uso.statusCode).toBe(200);
    expect(uso.json()).toEqual({
      plano: 'teste',
      limitado: false,
      testeFim: '2026-10-18T15:00:00.000Z',
      limites: [],
    });

    relogio.avancar(3 * DIA_MS);
    const depois = (await chamar(usuario, 'GET', '/assinatura/uso')).json<UsoPlano>();
    expect(depois).toMatchObject({ plano: 'gratuito', limitado: true, testeFim: null });
    expect((await lancar(usuario)).statusCode).toBe(201);
    expect(await usoDe(usuario, 'lancamento')).toEqual([['2026-10-18', 1]]);
  });

  it('RN-120 RN-127 um cartão no gratuito: os que já existem continuam e podem ser editados', async () => {
    const usuario = await usuarioNovo('teste');
    const nubank = await cartao(usuario, 'Nubank');
    expect(nubank.statusCode).toBe(201);
    expect((await cartao(usuario, 'Inter')).statusCode).toBe(201);
    await virarGratuito(usuario.usuarioId);

    const terceiro = await cartao(usuario, 'Itaú');
    expect(terceiro.statusCode).toBe(403);
    expect(terceiro.json()).toEqual({
      erro: {
        codigo: 'LIMITE_PLANO_ATINGIDO',
        mensagem: 'O plano gratuito permite 1 cartão. Para ter mais, conheça os planos.',
        detalhes: { recurso: 'cartao', periodo: 'quantidade', limite: 1, renovaEm: null },
      },
    });
    const lista = await chamar(usuario, 'GET', '/cartoes');
    expect(lista.json<{ itens: unknown[] }>().itens).toHaveLength(2);
    const { id } = nubank.json<{ id: string }>();
    const editado = await chamar(usuario, 'PATCH', `/cartoes/${id}`, { nome: 'Nubank Roxo' });
    expect(editado.statusCode).toBe(200);

    // Conta o que existe: com um só, ainda não cabe outro; sem nenhum, cabe.
    expect((await chamar(usuario, 'DELETE', `/cartoes/${id}`)).statusCode).toBe(204);
    expect((await cartao(usuario, 'Itaú')).statusCode).toBe(403);
    const [restante] = lista
      .json<{ itens: { id: string }[] }>()
      .itens.filter((item) => item.id !== id);
    expect((await chamar(usuario, 'DELETE', `/cartoes/${restante?.id ?? ''}`)).statusCode).toBe(
      204,
    );
    expect((await cartao(usuario, 'Itaú')).statusCode).toBe(201);
  });

  it('GET /assinatura/uso: no gratuito, o uso de cada limite e quando volta', async () => {
    const usuario = await usuarioNovo();
    await usado(usuario, 'lancamento', 7, '2026-10-02');
    await lancar(usuario);
    await lancar(usuario);
    await cartao(usuario, 'Nubank');
    await usado(usuario, 'leitura_documento', 1, '2026-10-03');

    const resposta = await chamar(usuario, 'GET', '/assinatura/uso');
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      plano: 'gratuito',
      limitado: true,
      testeFim: null,
      limites: [
        {
          recurso: 'lancamento',
          periodo: 'dia',
          uso: 2,
          limite: 3,
          renovaEm: '2026-10-16T03:00:00.000Z',
        },
        {
          recurso: 'lancamento',
          periodo: 'mes',
          uso: 9,
          limite: 30,
          renovaEm: '2026-11-01T03:00:00.000Z',
        },
        {
          recurso: 'mensagem_mony',
          periodo: 'dia',
          uso: 0,
          limite: 10,
          renovaEm: '2026-10-16T03:00:00.000Z',
        },
        {
          recurso: 'leitura_documento',
          periodo: 'mes',
          uso: 1,
          limite: 3,
          renovaEm: '2026-11-01T03:00:00.000Z',
        },
        { recurso: 'cartao', periodo: 'quantidade', uso: 1, limite: 1, renovaEm: null },
        { recurso: 'lista_compras', periodo: 'quantidade', uso: 0, limite: 1, renovaEm: null },
        { recurso: 'lembrete_ativo', periodo: 'quantidade', uso: 0, limite: 5, renovaEm: null },
      ],
    });
  });

  it('RN-120 relatórios no gratuito: só o mês atual; no teste, o período pedido', async () => {
    const usuario = await usuarioNovo();
    const padrao = await chamar(usuario, 'GET', '/relatorios/mensal');
    expect(padrao.statusCode).toBe(200);
    expect(padrao.json()).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(padrao.json<{ itens: unknown[] }>().itens).toHaveLength(1);

    const cortado = await chamar(
      usuario,
      'GET',
      '/relatorios/categorias?inicio=2026-09-01&fim=2026-10-10',
    );
    expect(cortado.json()).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-10' });

    const passado = await chamar(
      usuario,
      'GET',
      '/relatorios/mensal?inicio=2026-08-01&fim=2026-08-31',
    );
    expect(passado.statusCode).toBe(403);
    expect(passado.json()).toEqual({
      erro: {
        codigo: 'LIMITE_PLANO_ATINGIDO',
        mensagem: 'No plano gratuito, os relatórios mostram só o mês atual.',
        detalhes: { recurso: 'relatorio', periodo: 'mes', limite: 1, renovaEm: null },
      },
    });

    const teste = await usuarioNovo('teste');
    const doTeste = await chamar(teste, 'GET', '/relatorios/mensal');
    expect(doTeste.json()).toMatchObject({ inicio: '2025-11-01', fim: '2026-10-31' });
  });

  it('RN-120 RN-123 dez mensagens por dia: a 11ª recebe o aviso com [Ver planos], sem o modelo', async () => {
    const usuario = await usuarioNovo();
    await usado(usuario, 'mensagem_mony', 9, '2026-10-15');
    modelo.roteirizar({ texto: 'Oi, Ana!' });
    expect((await conversar(usuario, 'oi')).texto).toBe('Oi, Ana!');

    const { eventos, texto, componentes } = await conversar(usuario, 'quanto gastei?');
    expect(eventos.map(({ tipo }) => tipo)).toEqual(['texto.delta', 'componente', 'fim']);
    expect(texto).toBe(
      'Você chegou ao limite de 10 mensagens para a Mony por dia do plano gratuito. Amanhã libera de novo.',
    );
    expect(componentes).toEqual([botaoVerPlanos()]);
    expect(modelo.pedidos).toHaveLength(1);
    expect(await usoDe(usuario, 'mensagem_mony')).toEqual([['2026-10-15', 10]]);
    // A mensagem e o aviso ficam no histórico.
    const mensagens = await prisma.mensagem.findMany({
      where: { usuarioId: usuario.usuarioId },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: { autor: true, conteudo: true },
    });
    expect(mensagens.slice(-2)).toEqual([
      { autor: 'usuario', conteudo: 'quanto gastei?' },
      { autor: 'mony', conteudo: texto },
    ]);
  });

  it('RN-123 lançamento pela Mony no limite: avisa antes das perguntas e não guarda rascunho', async () => {
    const usuario = await usuarioNovo();
    await usado(usuario, 'lancamento', 3, '2026-10-15');
    const { texto, componentes } = await conversar(usuario, 'gastei 10');
    expect(texto).toBe(LIMITE_DO_DIA);
    expect(componentes).toEqual([botaoVerPlanos()]);
    expect(await prisma.rascunhoLancamento.count({ where: { usuarioId: usuario.usuarioId } })).toBe(
      0,
    );
    expect(modelo.pedidos).toEqual([]);
  });

  it('RN-123 ferramentas no limite: o modelo recebe o erro e o [Ver planos] aparece uma vez', async () => {
    const usuario = await usuarioNovo();
    await usado(usuario, 'lancamento', 3, '2026-10-15');
    modelo.roteirizar(
      {
        ferramentas: [
          {
            nome: 'criar_transacao',
            entrada: {
              tipo: 'receita',
              descricao: 'Salário',
              valorCentavos: 500_000,
              categoriaId: usuario.receita,
            },
          },
          {
            nome: 'criar_transacao',
            entrada: {
              tipo: 'despesa',
              descricao: 'Mercado',
              valorCentavos: 2_000,
              categoriaId: usuario.despesa,
              formaPagamento: 'pix',
            },
          },
        ],
      },
      { texto: 'Não deu para anotar: o plano gratuito chegou ao limite de hoje.' },
    );
    const { texto, componentes } = await conversar(usuario, 'anota o salário e o mercado de hoje');
    expect(texto).toBe('Não deu para anotar: o plano gratuito chegou ao limite de hoje.');
    expect(componentes).toEqual([botaoVerPlanos()]);
    expect(await transacoesDe(usuario)).toBe(0);
    const resultados = JSON.stringify(modelo.pedidos[1]?.mensagens.at(-1));
    expect(resultados).toContain('LIMITE_PLANO_ATINGIDO');
    expect(resultados).toContain('gravado');
  });
});
