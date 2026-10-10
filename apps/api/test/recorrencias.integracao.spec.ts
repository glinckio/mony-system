/**
 * Recorrências com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`). A
 * rotina é chamada direto no Service, com o instante que o teste escolhe.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { dataNoFuso } from '@mony/shared/datas';
import { ocorrenciasEntre, somarDias } from '@mony/shared/recorrencias';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { RecorrenciasService } from '../src/modulos/recorrencias/recorrencias.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface Ocorrencia {
  id: string;
  data: string;
  valorCentavos: number;
  status: string;
}

interface Resposta {
  recorrencia: {
    id: string;
    proximaGeracao: string | null;
    ativa: boolean;
    dataFim: string | null;
  };
  ocorrencias: Ocorrencia[];
}

describe.runIf(ativo)('integração: recorrências', () => {
  let app: NestFastifyApplication;
  let servico: RecorrenciasService;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  const hoje = dataNoFuso(new Date(), 'America/Sao_Paulo');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    servico = app.get(RecorrenciasService);
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
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso, despesa: despesa.id };
  }

  function chamar(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    acesso: string,
    payload?: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${acesso}`, ...headers },
      ...(payload ? { payload } : {}),
    });
  }

  async function criar(acesso: string, dados: Record<string, unknown>): Promise<Resposta> {
    const resposta = await chamar('POST', '/recorrencias', acesso, dados, {
      'idempotency-key': randomUUID(),
    });
    expect(resposta.statusCode).toBe(201);
    return resposta.json<Resposta>();
  }

  const ocorrenciasNoBanco = (recorrenciaId: string) =>
    prisma.transacao.findMany({
      where: { recorrenciaId },
      orderBy: { data: 'asc' },
      select: { id: true, data: true, valor: true, status: true },
    });

  it('RN-043 cria e gera as ocorrências dos próximos 35 dias, pendentes', async () => {
    const usuario = await usuarioNovo();
    const { recorrencia, ocorrencias } = await criar(usuario.acesso, {
      tipo: 'despesa',
      descricao: 'Academia',
      valorCentavos: 9990,
      categoriaId: usuario.despesa,
      formaPagamento: 'pix',
      frequencia: 'semanal',
      dataInicio: hoje,
    });
    const esperadas = [0, 7, 14, 21, 28, 35].map((dias) => somarDias(hoje, dias));
    expect(ocorrencias.map(({ data }) => data)).toEqual(esperadas);
    expect(ocorrencias.every(({ status }) => status === 'pendente')).toBe(true);
    expect(recorrencia).toMatchObject({ ativa: true, proximaGeracao: somarDias(hoje, 42) });

    // A rotina não duplica, e anda quando a janela anda. (O banco é compartilhado com os outros
    // testes, então a conferência é pelas ocorrências desta recorrência.)
    await servico.gerarPendentes(new Date());
    expect(await ocorrenciasNoBanco(recorrencia.id)).toHaveLength(6);
    const daquiAUmaSemana = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await servico.gerarPendentes(daquiAUmaSemana);
    await servico.gerarPendentes(daquiAUmaSemana);
    const noBanco = await ocorrenciasNoBanco(recorrencia.id);
    expect(noBanco).toHaveLength(7);
    expect(new Set(noBanco.map(({ data }) => data.toISOString())).size).toBe(7);
  });

  it('respeita a data final e para quando acaba', async () => {
    const usuario = await usuarioNovo();
    const { recorrencia, ocorrencias } = await criar(usuario.acesso, {
      tipo: 'despesa',
      descricao: 'Curso',
      valorCentavos: 20000,
      categoriaId: usuario.despesa,
      formaPagamento: 'boleto',
      frequencia: 'semanal',
      dataInicio: hoje,
      dataFim: somarDias(hoje, 10),
    });
    expect(ocorrencias).toHaveLength(2);
    expect(recorrencia).toMatchObject({ ativa: false, proximaGeracao: null });
  });

  it('RN-043 editar muda só as futuras pendentes e não editadas à mão', async () => {
    const usuario = await usuarioNovo();
    const { recorrencia, ocorrencias } = await criar(usuario.acesso, {
      tipo: 'despesa',
      descricao: 'Streaming',
      valorCentavos: 3990,
      categoriaId: usuario.despesa,
      formaPagamento: 'debito',
      frequencia: 'semanal',
      dataInicio: hoje,
    });
    const [primeira, segunda, terceira] = ocorrencias;
    // A segunda foi editada à mão; a terceira foi paga.
    await chamar('PATCH', `/transacoes/${segunda?.id ?? ''}`, usuario.acesso, {
      valorCentavos: 5000,
    });
    await chamar('PATCH', `/transacoes/${terceira?.id ?? ''}`, usuario.acesso, { status: 'pago' });
    await prisma.transacao.update({
      where: { id: terceira?.id ?? '' },
      data: { editadaManualmente: false },
    });

    const resposta = await chamar('PATCH', `/recorrencias/${recorrencia.id}`, usuario.acesso, {
      valorCentavos: 4590,
      descricao: 'Streaming família',
    });
    expect(resposta.statusCode).toBe(200);
    const valores = new Map(
      (await ocorrenciasNoBanco(recorrencia.id)).map(({ id, valor }) => [id, Number(valor)]),
    );
    expect(valores.get(primeira?.id ?? '')).toBe(4590);
    expect(valores.get(segunda?.id ?? '')).toBe(5000);
    expect(valores.get(terceira?.id ?? '')).toBe(3990);
  });

  it('mudar a frequência refaz as futuras livres pela agenda nova', async () => {
    const usuario = await usuarioNovo();
    const { recorrencia } = await criar(usuario.acesso, {
      tipo: 'despesa',
      descricao: 'Diarista',
      valorCentavos: 15000,
      categoriaId: usuario.despesa,
      formaPagamento: 'pix',
      frequencia: 'semanal',
      dataInicio: hoje,
    });
    const resposta = await chamar('PATCH', `/recorrencias/${recorrencia.id}`, usuario.acesso, {
      frequencia: 'mensal',
      dia: Number(hoje.slice(8, 10)),
    });
    expect(resposta.statusCode).toBe(200);
    const ativas = await ocorrenciasNoBanco(recorrencia.id);
    const esperadas = ocorrenciasEntre(
      { frequencia: 'mensal', dia: Number(hoje.slice(8, 10)), dataInicio: hoje, dataFim: null },
      hoje,
      somarDias(hoje, 35),
    );
    expect(ativas.map(({ data }) => data.toISOString().slice(0, 10))).toEqual(esperadas);
  });

  it('RN-043 excluir "esta e as próximas" encerra a recorrência na véspera', async () => {
    const usuario = await usuarioNovo();
    const { recorrencia, ocorrencias } = await criar(usuario.acesso, {
      tipo: 'despesa',
      descricao: 'Mensalidade',
      valorCentavos: 10000,
      categoriaId: usuario.despesa,
      formaPagamento: 'boleto',
      frequencia: 'semanal',
      dataInicio: hoje,
    });
    const terceira = ocorrencias[2];
    const resposta = await chamar(
      'DELETE',
      `/transacoes/${terceira?.id ?? ''}?recorrencia=proximas`,
      usuario.acesso,
    );
    expect(resposta.statusCode).toBe(204);
    expect((await ocorrenciasNoBanco(recorrencia.id)).map(({ id }) => id)).toEqual(
      ocorrencias.slice(0, 2).map(({ id }) => id),
    );
    const depois = (await chamar('GET', `/recorrencias/${recorrencia.id}`, usuario.acesso)).json<
      Resposta['recorrencia']
    >();
    expect(depois).toMatchObject({ ativa: false, dataFim: somarDias(terceira?.data ?? hoje, -1) });
    await servico.gerarPendentes(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    expect(await ocorrenciasNoBanco(recorrencia.id)).toHaveLength(2);
  });

  it('RN-043 "todas" exclui todas; "só esta" exclui uma', async () => {
    const usuario = await usuarioNovo();
    const { recorrencia, ocorrencias } = await criar(usuario.acesso, {
      tipo: 'despesa',
      descricao: 'Feira',
      valorCentavos: 8000,
      categoriaId: usuario.despesa,
      formaPagamento: 'dinheiro',
      frequencia: 'semanal',
      dataInicio: hoje,
    });
    await chamar('DELETE', `/transacoes/${ocorrencias[1]?.id ?? ''}`, usuario.acesso);
    expect(await ocorrenciasNoBanco(recorrencia.id)).toHaveLength(ocorrencias.length - 1);
    await chamar(
      'DELETE',
      `/transacoes/${ocorrencias[0]?.id ?? ''}?recorrencia=todas`,
      usuario.acesso,
    );
    expect(await ocorrenciasNoBanco(recorrencia.id)).toHaveLength(0);
    expect((await chamar('GET', '/recorrencias', usuario.acesso)).json()).toEqual({ itens: [] });
  });

  it('excluir a recorrência tira as futuras livres e mantém as passadas', async () => {
    const usuario = await usuarioNovo();
    const { recorrencia } = await criar(usuario.acesso, {
      tipo: 'despesa',
      descricao: 'Plano de saúde',
      valorCentavos: 50000,
      categoriaId: usuario.despesa,
      formaPagamento: 'boleto',
      frequencia: 'semanal',
      dataInicio: somarDias(hoje, -14),
    });
    expect(await ocorrenciasNoBanco(recorrencia.id)).toHaveLength(8);
    expect(
      (await chamar('DELETE', `/recorrencias/${recorrencia.id}`, usuario.acesso)).statusCode,
    ).toBe(204);
    const restantes = await ocorrenciasNoBanco(recorrencia.id);
    expect(restantes.map(({ data }) => data.toISOString().slice(0, 10))).toEqual([
      somarDias(hoje, -14),
      somarDias(hoje, -7),
    ]);
  });

  it('valida: Idempotency-Key, início no máximo um ano atrás, sem cartão de crédito', async () => {
    const usuario = await usuarioNovo();
    const corpo = {
      tipo: 'despesa',
      descricao: 'X',
      valorCentavos: 100,
      categoriaId: usuario.despesa,
      formaPagamento: 'pix',
      frequencia: 'mensal',
      dataInicio: hoje,
    };
    expect((await chamar('POST', '/recorrencias', usuario.acesso, corpo)).statusCode).toBe(400);
    const cabecalho = () => ({ 'idempotency-key': randomUUID() });
    for (const extra of [
      { dataInicio: somarDias(hoje, -400) },
      { formaPagamento: 'cartao_credito' },
      { dia: 0 },
    ]) {
      expect(
        (await chamar('POST', '/recorrencias', usuario.acesso, { ...corpo, ...extra }, cabecalho()))
          .statusCode,
      ).toBe(400);
    }
  });
});
