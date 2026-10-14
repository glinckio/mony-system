/**
 * Listas de compras (T-123a, RN-070 a RN-073) com Postgres de verdade (`TESTES_INTEGRACAO=1`): as
 * rotas, o preço sugerido pelos cupons fiscais (gravados direto, como a T-066a grava), o orçamento
 * livre da categoria, o "Finalizar" que lança a despesa e o limite do gratuito (RN-120).
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { DetalheLista, ListaListas } from '@mony/shared/listas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: listas de compras', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo('2026-10-15T15:00:00Z'))
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo(plano: 'mensal' | 'gratuito' = 'mensal') {
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
    await prisma.assinatura.update({
      where: { usuarioId: sessao.usuario.id },
      data: { plano, testeInicio: null, testeFim: null },
    });
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  async function ok<T>(resposta: Awaited<ReturnType<typeof chamar>>): Promise<T> {
    expect(resposta.statusCode, resposta.body).toBeLessThan(300);
    return Promise.resolve(resposta.json<T>());
  }

  /** Um cupom lido (T-066a): a nota e os itens, `[descrição, unidade, centavos]`. */
  async function cupom(
    usuario: Usuario,
    dados: { emitente: string; cnpj: string; data: string; itens: [string, string, number][] },
  ) {
    const nota = await prisma.nfceNota.create({
      data: {
        usuarioId: usuario.usuarioId,
        chaveAcesso: `35${String(randomInt(10 ** 9)).padStart(42, '0')}`.slice(0, 44),
        emitente: dados.emitente,
        cnpj: dados.cnpj,
        data: new Date(dados.data),
        total: BigInt(dados.itens.reduce((soma, [, , valor]) => soma + valor, 0)),
        uf: 'SP',
      },
    });
    await prisma.nfceItem.createMany({
      data: dados.itens.map(([descricao, unidade, valor]) => ({
        usuarioId: usuario.usuarioId,
        notaId: nota.id,
        descricao,
        quantidade: 1,
        unidade,
        valorUnitario: BigInt(valor),
        valorTotal: BigInt(valor),
      })),
    });
  }

  const categoria = (usuario: Usuario, nome: string) =>
    prisma.categoria.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId, nome, tipo: 'despesa' },
    });

  it('RN-070 RN-071 RN-073 a lista: itens com o preço do cupom e a variação, o total e o orçamento livre', async () => {
    const ana = await usuarioNovo();
    await cupom(ana, {
      emitente: 'SUPERMERCADO BOM PRECO LTDA',
      cnpj: '11111111000111',
      data: '2026-10-10T18:30:00Z',
      itens: [
        ['CAFE TORRADO PILAO 500G', 'UN', 2_190],
        ['LEITE INTEGRAL ITALAC 1L', 'UN', 599],
      ],
    });
    await cupom(ana, {
      emitente: 'ATACADAO S.A.',
      cnpj: '22222222000122',
      data: '2026-09-02T14:00:00Z',
      itens: [['CAFE TORRADO PILAO 500G', 'UN', 1_955]],
    });
    // Há mais de 90 dias: não serve de sugestão.
    await cupom(ana, {
      emitente: 'MERCADO VELHO',
      cnpj: '33333333000133',
      data: '2026-06-01T14:00:00Z',
      itens: [['ARROZ TIPO 1 5KG', 'UN', 2_490]],
    });
    const mercado = await categoria(ana, 'Mercado');
    await ok(
      await chamar(ana, 'PUT', '/orcamentos', {
        categoriaId: mercado.id,
        valorLimiteCentavos: 60_000,
      }),
    );

    const lista = await ok<DetalheLista>(
      await chamar(ana, 'POST', '/listas', { nome: 'Mercado do mês', categoria: 'mercado' }),
    );
    expect(lista).toMatchObject({
      nome: 'Mercado do mês',
      categoria: 'mercado',
      finalizadaEm: null,
      itens: [],
      categoriaDespesa: { id: mercado.id, nome: 'Mercado' },
      orcamento: { limiteCentavos: 60_000, gastoCentavos: 0, restanteCentavos: 60_000 },
    });

    await ok(
      await chamar(ana, 'POST', `/listas/${lista.id}/itens`, { nome: 'Café torrado 500 g' }),
    );
    // "Leite integral" acha "LEITE INTEGRAL ITALAC 1L" pelas palavras.
    await ok(
      await chamar(ana, 'POST', `/listas/${lista.id}/itens`, {
        nome: 'Leite integral',
        quantidade: 6,
        unidade: 'L',
      }),
    );
    await ok(await chamar(ana, 'POST', `/listas/${lista.id}/itens`, { nome: 'Arroz 5 kg' }));
    const detalhe = await ok<DetalheLista>(
      await chamar(ana, 'POST', `/listas/${lista.id}/itens`, {
        nome: 'Sabão em pó',
        precoEstimadoCentavos: 3_290,
      }),
    );
    expect(
      detalhe.itens.map(({ nome, precoEstimadoCentavos, totalEstimadoCentavos }) => [
        nome,
        precoEstimadoCentavos,
        totalEstimadoCentavos,
      ]),
    ).toEqual([
      ['Café torrado 500 g', 2_190, 2_190],
      ['Leite integral', 599, 3_594],
      ['Arroz 5 kg', null, null],
      ['Sabão em pó', 3_290, 3_290],
    ]);
    expect(detalhe.itens[0]?.historico).toEqual({
      ultimoCentavos: 2_190,
      data: '2026-10-10',
      loja: 'SUPERMERCADO BOM PRECO',
      anteriorCentavos: 1_955,
      variacaoPercentual: 12,
    });
    expect(detalhe.itens[1]?.historico).toMatchObject({ anteriorCentavos: null });
    expect(detalhe).toMatchObject({
      quantidadeItens: 4,
      quantidadeComprados: 0,
      totalEstimadoCentavos: 2_190 + 3_594 + 3_290,
      totalCompradoCentavos: 0,
    });

    // De outra pessoa, não existe.
    const bia = await usuarioNovo();
    expect((await chamar(bia, 'GET', `/listas/${lista.id}`)).statusCode).toBe(404);
    expect(
      (await chamar(bia, 'PATCH', `/itens/${detalhe.itens[0]?.id ?? ''}`, { comprado: true }))
        .statusCode,
    ).toBe(404);
  });

  it('RN-072 marcar comprado e finalizar: uma despesa com o total dos comprados, na categoria da lista', async () => {
    const ana = await usuarioNovo();
    const lista = await ok<DetalheLista>(
      await chamar(ana, 'POST', '/listas', { nome: 'Farmácia', categoria: 'farmacia' }),
    );
    let detalhe = lista;
    for (const [nome, preco] of [
      ['Dipirona', 1_250],
      ['Protetor solar', 5_990],
      ['Curativo', 890],
    ] as const) {
      detalhe = await ok<DetalheLista>(
        await chamar(ana, 'POST', `/listas/${lista.id}/itens`, {
          nome,
          precoEstimadoCentavos: preco,
        }),
      );
    }
    const [dipirona, protetor, curativo] = detalhe.itens;
    if (!dipirona || !protetor || !curativo) throw new Error('faltam itens');

    // Sem nada comprado, não finaliza.
    const cedo = await chamar(ana, 'POST', `/listas/${lista.id}/finalizar`, {
      formaPagamento: 'pix',
    });
    expect(cedo.statusCode).toBe(400);

    await ok(await chamar(ana, 'PATCH', `/itens/${dipirona.id}`, { comprado: true }));
    await ok(
      await chamar(ana, 'PATCH', `/itens/${protetor.id}`, {
        comprado: true,
        precoEstimadoCentavos: 5_490,
      }),
    );
    const marcada = await ok<DetalheLista>(await chamar(ana, 'DELETE', `/itens/${curativo.id}`));
    expect(marcada.itens.map(({ nome, comprado }) => [nome, comprado])).toEqual([
      ['Dipirona', true],
      ['Protetor solar', true],
    ]);
    expect(marcada.totalCompradoCentavos).toBe(1_250 + 5_490);

    const fim = await ok<DetalheLista>(
      await chamar(ana, 'POST', `/listas/${lista.id}/finalizar`, { formaPagamento: 'pix' }),
    );
    expect(fim.finalizadaEm).not.toBeNull();
    const saude = await categoria(ana, 'Saúde');
    const despesa = await prisma.transacao.findUniqueOrThrow({
      where: { id: fim.transacaoId ?? '' },
    });
    expect(despesa).toMatchObject({
      usuarioId: ana.usuarioId,
      tipo: 'despesa',
      descricao: 'Farmácia',
      valor: 6_740n,
      categoriaId: saude.id,
      formaPagamento: 'pix',
    });

    // Finalizada não muda nem finaliza de novo.
    expect(
      (await chamar(ana, 'POST', `/listas/${lista.id}/itens`, { nome: 'Gaze' })).statusCode,
    ).toBe(409);
    expect(
      (await chamar(ana, 'POST', `/listas/${lista.id}/finalizar`, { formaPagamento: 'pix' }))
        .statusCode,
    ).toBe(409);
    const listas = await ok<ListaListas>(await chamar(ana, 'GET', '/listas'));
    expect(listas.itens.map(({ id, finalizadaEm }) => [id, finalizadaEm !== null])).toEqual([
      [lista.id, true],
    ]);
  });

  it('RN-072 item comprado sem preço: pede o valor; com ele, finaliza na categoria escolhida', async () => {
    const ana = await usuarioNovo();
    const lista = await ok<DetalheLista>(
      await chamar(ana, 'POST', '/listas', { nome: 'Casa', categoria: 'casa' }),
    );
    const comItem = await ok<DetalheLista>(
      await chamar(ana, 'POST', `/listas/${lista.id}/itens`, { nome: 'Lâmpada' }),
    );
    await ok(
      await chamar(ana, 'PATCH', `/itens/${comItem.itens[0]?.id ?? ''}`, { comprado: true }),
    );
    const semValor = await chamar(ana, 'POST', `/listas/${lista.id}/finalizar`, {
      formaPagamento: 'pix',
    });
    expect(semValor.json()).toMatchObject({
      erro: { mensagem: 'Há itens comprados sem preço: informe o valor da compra.' },
    });
    const outros = await categoria(ana, 'Outros');
    const fim = await ok<DetalheLista>(
      await chamar(ana, 'POST', `/listas/${lista.id}/finalizar`, {
        formaPagamento: 'dinheiro',
        valorCentavos: 2_500,
        categoriaId: outros.id,
        descricao: 'Lâmpadas',
        data: '2026-10-14',
      }),
    );
    const despesa = await prisma.transacao.findUniqueOrThrow({
      where: { id: fim.transacaoId ?? '' },
    });
    expect(despesa).toMatchObject({ valor: 2_500n, categoriaId: outros.id, descricao: 'Lâmpadas' });
    expect(despesa.data.toISOString().slice(0, 10)).toBe('2026-10-14');
  });

  it('RN-072 dois "Finalizar" ao mesmo tempo lançam uma despesa; a falha no lançamento reabre a lista', async () => {
    const ana = await usuarioNovo();
    const lista = await ok<DetalheLista>(
      await chamar(ana, 'POST', '/listas', { nome: 'Carro', categoria: 'carro' }),
    );
    const comItem = await ok<DetalheLista>(
      await chamar(ana, 'POST', `/listas/${lista.id}/itens`, {
        nome: 'Óleo 5W30',
        precoEstimadoCentavos: 4_500,
      }),
    );
    await ok(
      await chamar(ana, 'PATCH', `/itens/${comItem.itens[0]?.id ?? ''}`, { comprado: true }),
    );

    // Um cartão que não existe: o lançamento falha e a lista continua aberta.
    const falha = await chamar(ana, 'POST', `/listas/${lista.id}/finalizar`, {
      formaPagamento: 'credito',
      cartaoId: randomUUID(),
    });
    expect(falha.statusCode).toBeGreaterThanOrEqual(400);
    expect(
      (await ok<DetalheLista>(await chamar(ana, 'GET', `/listas/${lista.id}`))).finalizadaEm,
    ).toBeNull();

    const respostas = await Promise.all(
      [1, 2].map(() =>
        chamar(ana, 'POST', `/listas/${lista.id}/finalizar`, { formaPagamento: 'pix' }),
      ),
    );
    expect(respostas.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
    expect(
      await prisma.transacao.count({ where: { usuarioId: ana.usuarioId, excluidoEm: null } }),
    ).toBe(1);
  });

  it('RN-120 no gratuito, uma lista aberta; a finalizada não conta', async () => {
    const ana = await usuarioNovo('gratuito');
    const primeira = await ok<DetalheLista>(
      await chamar(ana, 'POST', '/listas', { nome: 'Mercado', categoria: 'mercado' }),
    );
    const segunda = await chamar(ana, 'POST', '/listas', { nome: 'Casa', categoria: 'casa' });
    expect(segunda.statusCode).toBe(403);
    expect(segunda.json()).toMatchObject({
      erro: {
        codigo: 'LIMITE_PLANO_ATINGIDO',
        detalhes: { recurso: 'lista_compras', periodo: 'quantidade', limite: 1 },
      },
    });
    const comItem = await ok<DetalheLista>(
      await chamar(ana, 'POST', `/listas/${primeira.id}/itens`, {
        nome: 'Arroz',
        precoEstimadoCentavos: 2_000,
      }),
    );
    await ok(
      await chamar(ana, 'PATCH', `/itens/${comItem.itens[0]?.id ?? ''}`, { comprado: true }),
    );
    await ok(
      await chamar(ana, 'POST', `/listas/${primeira.id}/finalizar`, { formaPagamento: 'pix' }),
    );
    await ok(await chamar(ana, 'POST', '/listas', { nome: 'Casa', categoria: 'casa' }));
    // Excluir a lista finalizada deixa a despesa.
    expect((await chamar(ana, 'DELETE', `/listas/${primeira.id}`)).statusCode).toBe(204);
    expect(await prisma.transacao.count({ where: { usuarioId: ana.usuarioId } })).toBe(1);
  });
});
