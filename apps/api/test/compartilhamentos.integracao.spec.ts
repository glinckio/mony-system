/**
 * Compartilhamento de listas (T-124a, RN-074) com Postgres e Redis de verdade
 * (`TESTES_INTEGRACAO=1`): convites por e-mail e telefone, aceitar, recusar, sair e remover, a
 * permissão `ver` ou `editar` em cada rota das listas e o "Finalizar" de quem foi convidado.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import {
  type Compartilhamento,
  type ListaCompartilhamentos,
  MAXIMO_CONVITES_POR_HORA,
} from '@mony/shared/compartilhamentos';
import type { DetalheLista, ListaListas } from '@mony/shared/listas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** O telefone que os outros testes usam em todo cadastro: várias contas têm esse número. */
const TELEFONE_REPETIDO = '(11) 98765-4321';

describe.runIf(ativo)('integração: compartilhamento de listas', () => {
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

  async function usuarioNovo(nome: string, telefone = TELEFONE_REPETIDO) {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome,
        email,
        telefone,
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    await prisma.assinatura.update({
      where: { usuarioId: sessao.usuario.id },
      data: { plano: 'mensal', testeInicio: null, testeFim: null },
    });
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso, email, nome };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  const codigo = (resposta: Awaited<ReturnType<typeof chamar>>) =>
    resposta.json<{ erro: { codigo: string } }>().erro.codigo;

  async function listaCom(dono: Usuario, nome: string, itens: string[]) {
    const lista = await ok<DetalheLista>(
      await chamar(dono, 'POST', '/listas', { nome, categoria: 'mercado' }),
    );
    for (const item of itens) {
      await ok(
        await chamar(dono, 'POST', `/listas/${lista.id}/itens`, {
          nome: item,
          precoEstimadoCentavos: 1_000,
        }),
      );
    }
    return lista;
  }

  const convidar = (
    dono: Usuario,
    listaId: string,
    contato: string,
    permissao: 'ver' | 'editar' = 'editar',
  ) =>
    chamar(dono, 'POST', '/compartilhamentos', {
      recurso: 'lista',
      recursoId: listaId,
      contato,
      permissao,
    });

  /** Um telefone que nenhum outro teste usa. */
  const telefoneUnico = () =>
    `(21) 9${String(randomInt(1000, 9999))}-${String(randomInt(1000, 9999))}`;

  it('RN-074 convite por e-mail: só depois de aceito a lista aparece, com o dono e a permissão', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const bia = await usuarioNovo('Bia Lima');
    const lista = await listaCom(ana, 'Mercado do mês', ['Leite']);

    const convite = await ok<Compartilhamento>(
      await convidar(ana, lista.id, `  ${bia.email.toUpperCase()} `),
    );
    expect(convite).toMatchObject({
      recurso: 'lista',
      recursoId: lista.id,
      recursoNome: 'Mercado do mês',
      permissao: 'editar',
      status: 'pendente',
      dono: { id: ana.usuarioId, nome: 'Ana Souza' },
      convidado: { id: bia.usuarioId, nome: 'Bia Lima' },
    });
    expect(
      (await ok<ListaCompartilhamentos>(await chamar(bia, 'GET', '/compartilhamentos'))).recebidos,
    ).toEqual([convite]);

    // Pendente ainda não dá acesso.
    expect((await chamar(bia, 'GET', `/listas/${lista.id}`)).statusCode).toBe(404);
    expect((await ok<ListaListas>(await chamar(bia, 'GET', '/listas'))).itens).toEqual([]);

    const aceito = await ok<Compartilhamento>(
      await chamar(bia, 'POST', `/compartilhamentos/${convite.id}/aceitar`),
    );
    expect(aceito.status).toBe('aceito');
    // Aceitar de novo não muda nada; o dono não aceita pelo convidado.
    expect((await chamar(bia, 'POST', `/compartilhamentos/${convite.id}/aceitar`)).statusCode).toBe(
      200,
    );
    expect((await chamar(ana, 'POST', `/compartilhamentos/${convite.id}/aceitar`)).statusCode).toBe(
      404,
    );

    const daBia = await ok<ListaListas>(await chamar(bia, 'GET', '/listas'));
    expect(daBia.itens).toMatchObject([
      {
        id: lista.id,
        acesso: 'editar',
        dono: { id: ana.usuarioId, nome: 'Ana Souza' },
        compartilhadaCom: 1,
        quantidadeItens: 1,
      },
    ]);
    const daAna = await ok<ListaListas>(await chamar(ana, 'GET', '/listas'));
    expect(daAna.itens).toMatchObject([
      { id: lista.id, acesso: 'dono', dono: null, compartilhadaCom: 1 },
    ]);
    expect(await ok<DetalheLista>(await chamar(bia, 'GET', `/listas/${lista.id}`))).toMatchObject({
      acesso: 'editar',
      dono: { nome: 'Ana Souza' },
      itens: [{ nome: 'Leite' }],
    });
  });

  it('RN-074 editar mexe nos itens e finaliza (a despesa é de quem finaliza); ver só lê; o resto é do dono', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const bia = await usuarioNovo('Bia Lima');
    const carla = await usuarioNovo('Carla Dias');
    const lista = await listaCom(ana, 'Feira', ['Banana']);
    const convite = await ok<Compartilhamento>(await convidar(ana, lista.id, bia.email));
    await ok(await chamar(bia, 'POST', `/compartilhamentos/${convite.id}/aceitar`));

    // Com editar: põe, marca e tira itens. O item é da lista (do dono), mesmo posto pela Bia.
    const comMaca = await ok<DetalheLista>(
      await chamar(bia, 'POST', `/listas/${lista.id}/itens`, {
        nome: 'Maçã',
        precoEstimadoCentavos: 750,
      }),
    );
    const maca = comMaca.itens.find(({ nome }) => nome === 'Maçã');
    const banana = comMaca.itens.find(({ nome }) => nome === 'Banana');
    if (!maca || !banana) throw new Error('sem os itens');
    expect((await prisma.itemLista.findUniqueOrThrow({ where: { id: maca.id } })).usuarioId).toBe(
      ana.usuarioId,
    );
    await ok(await chamar(bia, 'PATCH', `/itens/${maca.id}`, { comprado: true }));
    await ok(await chamar(bia, 'PATCH', `/itens/${banana.id}`, { comprado: true }));

    // Nome, apagar e convidar são do dono.
    expect(codigo(await chamar(bia, 'PATCH', `/listas/${lista.id}`, { nome: 'Minha' }))).toBe(
      'ACESSO_NEGADO',
    );
    expect(codigo(await chamar(bia, 'DELETE', `/listas/${lista.id}`))).toBe('ACESSO_NEGADO');
    expect(codigo(await convidar(bia, lista.id, carla.email))).toBe('ACESSO_NEGADO');

    // Quem não foi convidado não vê nem mexe: 404, como se a lista não existisse.
    expect((await chamar(carla, 'GET', `/listas/${lista.id}`)).statusCode).toBe(404);
    expect(
      (await chamar(carla, 'PATCH', `/itens/${maca.id}`, { comprado: false })).statusCode,
    ).toBe(404);
    expect((await chamar(carla, 'DELETE', `/itens/${maca.id}`)).statusCode).toBe(404);
    expect(codigo(await convidar(carla, lista.id, bia.email))).toBe('NAO_ENCONTRADO');
    expect(
      (await chamar(carla, 'POST', `/compartilhamentos/${convite.id}/aceitar`)).statusCode,
    ).toBe(404);
    expect((await chamar(carla, 'DELETE', `/compartilhamentos/${convite.id}`)).statusCode).toBe(
      404,
    );

    // Com ver: lê, mas não mexe.
    const paraVer = await ok<Compartilhamento>(
      await chamar(ana, 'PATCH', `/compartilhamentos/${convite.id}`, { permissao: 'ver' }),
    );
    expect(paraVer).toMatchObject({ permissao: 'ver', status: 'aceito' });
    expect(
      (await chamar(bia, 'PATCH', `/compartilhamentos/${convite.id}`, { permissao: 'editar' }))
        .statusCode,
    ).toBe(404);
    expect(await ok<DetalheLista>(await chamar(bia, 'GET', `/listas/${lista.id}`))).toMatchObject({
      acesso: 'ver',
    });
    expect(codigo(await chamar(bia, 'POST', `/listas/${lista.id}/itens`, { nome: 'Uva' }))).toBe(
      'ACESSO_NEGADO',
    );
    expect(codigo(await chamar(bia, 'PATCH', `/itens/${maca.id}`, { comprado: false }))).toBe(
      'ACESSO_NEGADO',
    );
    expect(
      codigo(await chamar(bia, 'POST', `/listas/${lista.id}/finalizar`, { formaPagamento: 'pix' })),
    ).toBe('ACESSO_NEGADO');

    // De volta a editar: a Bia finaliza e a despesa é dela, na categoria dela.
    await ok(
      await chamar(ana, 'PATCH', `/compartilhamentos/${convite.id}`, { permissao: 'editar' }),
    );
    const finalizada = await ok<DetalheLista>(
      await chamar(bia, 'POST', `/listas/${lista.id}/finalizar`, { formaPagamento: 'pix' }),
    );
    if (!finalizada.transacaoId) throw new Error('sem a despesa');
    const despesa = await prisma.transacao.findUniqueOrThrow({
      where: { id: finalizada.transacaoId },
      include: { categoria: { select: { usuarioId: true, nome: true } } },
    });
    expect(despesa).toMatchObject({
      usuarioId: bia.usuarioId,
      valor: 1_750n,
      categoria: { usuarioId: bia.usuarioId, nome: 'Mercado' },
    });
    expect(await prisma.transacao.count({ where: { usuarioId: ana.usuarioId } })).toBe(0);
    expect(
      (await ok<DetalheLista>(await chamar(ana, 'GET', `/listas/${lista.id}`))).finalizadaEm,
    ).not.toBeNull();
  });

  it('RN-074 convite por telefone, recusar, convidar de novo, sair e apagar a lista', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const telefone = telefoneUnico();
    const carla = await usuarioNovo('Carla Dias', telefone);
    const lista = await listaCom(ana, 'Casa', []);

    // O telefone vale com ou sem +55, espaços e traços; repetido em várias contas, pede o e-mail.
    const convite = await ok<Compartilhamento>(
      await convidar(ana, lista.id, `+55 ${telefone}`, 'ver'),
    );
    expect(convite).toMatchObject({ convidado: { id: carla.usuarioId }, permissao: 'ver' });
    expect(codigo(await convidar(ana, lista.id, TELEFONE_REPETIDO))).toBe('REQUISICAO_INVALIDA');
    expect(codigo(await convidar(ana, lista.id, 'ninguem@exemplo.test'))).toBe('NAO_ENCONTRADO');
    expect(codigo(await convidar(ana, lista.id, ana.email))).toBe('REQUISICAO_INVALIDA');

    // Recusado some dos recebidos, continua nos enviados e não dá para aceitar depois.
    const recusado = await ok<Compartilhamento>(
      await chamar(carla, 'POST', `/compartilhamentos/${convite.id}/recusar`),
    );
    expect(recusado.status).toBe('recusado');
    expect(
      (await ok<ListaCompartilhamentos>(await chamar(carla, 'GET', '/compartilhamentos')))
        .recebidos,
    ).toEqual([]);
    expect(
      (await ok<ListaCompartilhamentos>(await chamar(ana, 'GET', '/compartilhamentos'))).enviados,
    ).toMatchObject([{ id: convite.id, status: 'recusado' }]);
    expect(codigo(await chamar(carla, 'POST', `/compartilhamentos/${convite.id}/aceitar`))).toBe(
      'CONFLITO',
    );

    // Convidar de novo volta a pendente (o mesmo convite, com a permissão nova).
    const deNovo = await ok<Compartilhamento>(await convidar(ana, lista.id, carla.email));
    expect(deNovo).toMatchObject({ id: convite.id, status: 'pendente', permissao: 'editar' });
    await ok(await chamar(carla, 'POST', `/compartilhamentos/${convite.id}/aceitar`));
    expect((await chamar(carla, 'GET', `/listas/${lista.id}`)).statusCode).toBe(200);

    // A Carla sai: perde o acesso. Convidada de novo e com a lista apagada, o convite some.
    expect((await chamar(carla, 'DELETE', `/compartilhamentos/${convite.id}`)).statusCode).toBe(
      204,
    );
    expect((await chamar(carla, 'GET', `/listas/${lista.id}`)).statusCode).toBe(404);
    expect(
      (await ok<ListaListas>(await chamar(ana, 'GET', '/listas'))).itens[0]?.compartilhadaCom,
    ).toBe(0);
    await ok(await convidar(ana, lista.id, carla.email));
    expect((await chamar(ana, 'DELETE', `/listas/${lista.id}`)).statusCode).toBe(204);
    expect(
      await prisma.compartilhamento.count({ where: { recurso: 'lista', recursoId: lista.id } }),
    ).toBe(0);
  });

  it('decisão técnica: até 20 convites por hora, porque o convite diz se o contato tem conta', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const lista = await listaCom(ana, 'Farmácia', []);
    for (let vez = 0; vez < MAXIMO_CONVITES_POR_HORA; vez += 1) {
      expect(codigo(await convidar(ana, lista.id, `${randomUUID()}@exemplo.test`))).toBe(
        'NAO_ENCONTRADO',
      );
    }
    expect(codigo(await convidar(ana, lista.id, `${randomUUID()}@exemplo.test`))).toBe(
      'MUITAS_TENTATIVAS',
    );
  });
});
