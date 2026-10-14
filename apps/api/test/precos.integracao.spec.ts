/**
 * Histórico de preços da NFC-e (T-066c, RN-150) com Postgres de verdade (`TESTES_INTEGRACAO=1`):
 * os itens dos cupons gravados pela T-066a, a busca sem acento, o período no fuso do usuário, o
 * gratuito só no mês atual (RN-120) e o isolamento entre usuários.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { RelatorioPrecos } from '@mony/shared/relatorios';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: histórico de preços da NFC-e', () => {
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

  async function usuarioNovo() {
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
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  /** Um cupom lido (T-066a): a nota e os itens, `[descrição, unidade, centavos]`. */
  async function cupom(
    usuario: Usuario,
    dados: { emitente: string; cnpj: string; data: string; itens: [string, string, number][] },
  ) {
    const chave = `35${String(randomInt(10 ** 9)).padStart(42, '0')}`.slice(0, 44);
    const nota = await prisma.nfceNota.create({
      data: {
        usuarioId: usuario.usuarioId,
        chaveAcesso: chave,
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

  async function precos(usuario: Usuario, consulta: string) {
    return app.inject({
      method: 'GET',
      url: `/v1/relatorios/precos?${consulta}`,
      headers: { authorization: `Bearer ${usuario.acesso}` },
    });
  }

  it('RN-150 último preço, menor e média por loja; a busca não liga para acento nem maiúscula', async () => {
    const ana = await usuarioNovo();
    await cupom(ana, {
      emitente: 'SUPERMERCADO BOM PRECO LTDA',
      cnpj: '11111111000111',
      data: '2026-10-10T18:30:00Z',
      itens: [
        ['PAO FRANCES', 'KG', 1_699],
        ['LEITE INTEGRAL ITALAC 1L', 'UN', 549],
      ],
    });
    await cupom(ana, {
      emitente: 'ATACADAO S.A.',
      cnpj: '22222222000122',
      data: '2026-09-02T14:00:00Z',
      itens: [['LEITE INTEGRAL ITALAC 1L', 'UN', 499]],
    });
    // 01:30 de 1º/10 em UTC ainda é 30/09 em São Paulo: entra no período que termina em 30/09.
    await cupom(ana, {
      emitente: 'PADARIA SAO JOSE ME',
      cnpj: '33333333000133',
      data: '2026-10-01T01:30:00Z',
      itens: [['Pão de forma', 'UN', 899]],
    });

    const leite = await precos(ana, 'busca=Leite%20italac');
    expect(leite.statusCode).toBe(200);
    expect(leite.json<RelatorioPrecos>()).toEqual({
      inicio: '2025-11-01',
      fim: '2026-10-31',
      busca: 'Leite italac',
      itens: [
        {
          descricao: 'LEITE INTEGRAL ITALAC 1L',
          unidade: 'UN',
          compras: 2,
          ultimo: {
            valorUnitarioCentavos: 549,
            data: '2026-10-10',
            loja: 'SUPERMERCADO BOM PRECO',
          },
          menor: { valorUnitarioCentavos: 499, data: '2026-09-02', loja: 'ATACADAO' },
          porLoja: [
            { loja: 'ATACADAO', mediaCentavos: 499, compras: 1, ultimaData: '2026-09-02' },
            {
              loja: 'SUPERMERCADO BOM PRECO',
              mediaCentavos: 549,
              compras: 1,
              ultimaData: '2026-10-10',
            },
          ],
        },
      ],
    });

    const pao = (await precos(ana, `busca=${encodeURIComponent('PÃO')}`)).json<RelatorioPrecos>();
    expect(pao.itens.map(({ descricao }) => descricao)).toEqual(['PAO FRANCES', 'Pão de forma']);
    expect(pao.itens[1]?.ultimo).toEqual({
      valorUnitarioCentavos: 899,
      data: '2026-09-30',
      loja: 'PADARIA SAO JOSE',
    });

    const setembro = (
      await precos(ana, 'busca=pao&inicio=2026-09-01&fim=2026-09-30')
    ).json<RelatorioPrecos>();
    expect(setembro.itens.map(({ descricao }) => descricao)).toEqual(['Pão de forma']);
    expect((await precos(ana, 'busca=arroz')).json<RelatorioPrecos>().itens).toEqual([]);
    expect((await precos(ana, 'busca=a')).statusCode).toBe(400);
  });

  it('RN-120 no gratuito, só o mês atual; os cupons de outra pessoa não aparecem', async () => {
    const ana = await usuarioNovo();
    const bia = await usuarioNovo();
    await cupom(ana, {
      emitente: 'MERCADO X',
      cnpj: '44444444000144',
      data: '2026-10-03T12:00:00Z',
      itens: [['CAFE PILAO 500G', 'UN', 1_890]],
    });
    await cupom(ana, {
      emitente: 'MERCADO X',
      cnpj: '44444444000144',
      data: '2026-08-03T12:00:00Z',
      itens: [['CAFE PILAO 500G', 'UN', 1_590]],
    });
    expect((await precos(bia, 'busca=cafe')).json<RelatorioPrecos>().itens).toEqual([]);

    await prisma.assinatura.update({
      where: { usuarioId: ana.usuarioId },
      data: { plano: 'gratuito', testeInicio: null, testeFim: null },
    });
    const gratuito = (await precos(ana, 'busca=cafe')).json<RelatorioPrecos>();
    expect(gratuito).toMatchObject({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(gratuito.itens[0]).toMatchObject({
      compras: 1,
      menor: { valorUnitarioCentavos: 1_890 },
    });
  });
});
