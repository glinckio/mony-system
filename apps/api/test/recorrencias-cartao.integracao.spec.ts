/**
 * Recorrência no cartão de crédito (T-051) com Postgres e Redis de verdade (job Banco do CI,
 * `TESTES_INTEGRACAO=1`). O relógio fica parado em 15/10/2026 (quinta-feira), meio-dia em São
 * Paulo. Os cartões fecham dia 3 e vencem dia 10.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { RecorrenciasService } from '../src/modulos/recorrencias/recorrencias.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface Ocorrencia {
  id: string;
  data: string;
  valorCentavos: number;
  cartaoId: string | null;
  faturaId: string | null;
  formaPagamento: string | null;
}

describe.runIf(ativo)('integração: recorrência no cartão', () => {
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
    const despesa = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: sessao.usuario.id, tipo: 'despesa' },
    });
    return { acesso: sessao.tokens.acesso, despesa: despesa.id };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    usuario: Usuario,
    url: string,
    payload?: Record<string, unknown>,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  async function cartaoNovo(usuario: Usuario) {
    const resposta = await chamar('POST', usuario, '/cartoes', {
      nome: 'Nubank',
      limiteTotalCentavos: 100_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#820AD1',
    });
    return resposta.json<{ id: string }>().id;
  }

  async function totais(usuario: Usuario, cartaoId: string) {
    const resposta = await chamar('GET', usuario, `/cartoes/${cartaoId}/faturas`);
    return Object.fromEntries(
      resposta
        .json<{ itens: { competencia: string; valorTotalCentavos: number }[] }>()
        .itens.map((fatura) => [fatura.competencia, fatura.valorTotalCentavos]),
    );
  }

  async function assinatura(
    usuario: Usuario,
    cartaoId: string,
    dados: Record<string, unknown> = {},
  ) {
    const resposta = await chamar('POST', usuario, '/recorrencias', {
      tipo: 'despesa',
      descricao: 'Academia',
      valorCentavos: 1_000,
      categoriaId: usuario.despesa,
      formaPagamento: 'cartao_credito',
      cartaoId,
      frequencia: 'semanal',
      dataInicio: '2026-10-15',
      ...dados,
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return resposta.json<{
      recorrencia: { id: string; cartaoId: string };
      ocorrencias: Ocorrencia[];
    }>();
  }

  it('as ocorrências entram nas faturas pela data, e a rotina segue gerando', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario);
    const { recorrencia, ocorrencias } = await assinatura(usuario, cartaoId);
    expect(recorrencia.cartaoId).toBe(cartaoId);
    // Toda quinta até 19/11: as de outubro na fatura de novembro, as de novembro na de dezembro.
    expect(ocorrencias.map(({ data }) => data)).toEqual([
      '2026-10-15',
      '2026-10-22',
      '2026-10-29',
      '2026-11-05',
      '2026-11-12',
      '2026-11-19',
    ]);
    expect(ocorrencias.every((o) => o.cartaoId === cartaoId && o.faturaId !== null)).toBe(true);
    expect(await totais(usuario, cartaoId)).toEqual({ '2026-11-01': 3_000, '2026-12-01': 3_000 });

    // 20/11: a janela vai até 25/12; 03/12 já é da fatura de janeiro.
    await app.get(RecorrenciasService).gerarPendentes(new Date('2026-11-20T12:00:00Z'));
    expect(await totais(usuario, cartaoId)).toEqual({
      '2026-11-01': 3_000,
      '2026-12-01': 4_000,
      '2027-01-01': 4_000,
    });
  });

  it('editar refaz as ocorrências livres nas faturas; a editada à mão fica', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario);
    const outroCartao = await cartaoNovo(usuario);
    const { recorrencia, ocorrencias } = await assinatura(usuario, cartaoId);
    const editada = ocorrencias[1]?.id ?? '';
    await chamar('PATCH', usuario, `/transacoes/${editada}`, { valorCentavos: 5_000 });

    const valor = await chamar('PATCH', usuario, `/recorrencias/${recorrencia.id}`, {
      valorCentavos: 2_500,
    });
    expect(valor.statusCode, valor.body).toBe(200);
    expect(await totais(usuario, cartaoId)).toEqual({
      '2026-11-01': 2_500 + 5_000 + 2_500,
      '2026-12-01': 3 * 2_500,
    });

    // Para Pix: as livres saem do cartão; a editada à mão continua na fatura.
    const pix = await chamar('PATCH', usuario, `/recorrencias/${recorrencia.id}`, {
      formaPagamento: 'pix',
    });
    expect(pix.json()).toMatchObject({ recorrencia: { cartaoId: null, formaPagamento: 'pix' } });
    expect(await totais(usuario, cartaoId)).toEqual({ '2026-11-01': 5_000, '2026-12-01': 0 });

    // Para outro cartão.
    const outro = await chamar('PATCH', usuario, `/recorrencias/${recorrencia.id}`, {
      formaPagamento: 'cartao_credito',
      cartaoId: outroCartao,
    });
    expect(outro.statusCode, outro.body).toBe(200);
    expect(await totais(usuario, outroCartao)).toEqual({
      '2026-11-01': 2 * 2_500,
      '2026-12-01': 3 * 2_500,
    });

    // Parar a recorrência tira as livres de hoje em diante.
    expect((await chamar('DELETE', usuario, `/recorrencias/${recorrencia.id}`)).statusCode).toBe(
      204,
    );
    expect(await totais(usuario, outroCartao)).toEqual({ '2026-11-01': 0, '2026-12-01': 0 });
  });

  it('"todas" tira as ocorrências, menos as pagas pela fatura (RN-046)', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario);
    // Desde 17/09: 17/09, 24/09 e 01/10 caem na fatura de outubro, que fechou dia 3.
    const { ocorrencias } = await assinatura(usuario, cartaoId, { dataInicio: '2026-09-17' });
    const outubro = ocorrencias[0]?.faturaId ?? '';
    const pagamento = await chamar('POST', usuario, `/faturas/${outubro}/pagar`, {});
    expect(pagamento.statusCode, pagamento.body).toBe(201);

    const novembro = ocorrencias.find(({ data }) => data === '2026-10-15');
    const todas = await chamar(
      'DELETE',
      usuario,
      `/transacoes/${novembro?.id ?? ''}?recorrencia=todas`,
    );
    expect(todas.statusCode).toBe(204);
    expect(await totais(usuario, cartaoId)).toEqual({
      '2026-10-01': 3_000,
      '2026-11-01': 0,
      '2026-12-01': 0,
    });
    const paga = await chamar('GET', usuario, `/faturas/${outubro}`);
    expect(paga.json()).toMatchObject({ fatura: { status: 'paga' } });
  });

  it('cartão excluído para a recorrência dele', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario);
    // Começa depois da janela: ainda sem ocorrência, então o cartão não tem saldo.
    const { recorrencia, ocorrencias } = await assinatura(usuario, cartaoId, {
      frequencia: 'mensal',
      dataInicio: '2027-01-05',
    });
    expect(ocorrencias).toEqual([]);
    expect((await chamar('DELETE', usuario, `/cartoes/${cartaoId}`)).statusCode).toBe(204);
    const lista = await chamar('GET', usuario, '/recorrencias');
    expect(lista.json<{ itens: { id: string }[] }>().itens.map(({ id }) => id)).not.toContain(
      recorrencia.id,
    );
  });

  it('valida: cartão do usuário, sem conta, despesa', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    const cartaoDoOutro = await cartaoNovo(outro);
    const base = {
      tipo: 'despesa',
      descricao: 'Streaming',
      valorCentavos: 3_990,
      categoriaId: usuario.despesa,
      formaPagamento: 'cartao_credito',
      frequencia: 'mensal',
      dataInicio: '2026-10-20',
    };
    expect((await chamar('POST', usuario, '/recorrencias', base)).statusCode).toBe(400);
    expect(
      (await chamar('POST', usuario, '/recorrencias', { ...base, cartaoId: cartaoDoOutro }))
        .statusCode,
    ).toBe(404);
  });
});
