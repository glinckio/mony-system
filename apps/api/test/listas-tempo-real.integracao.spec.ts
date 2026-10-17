/**
 * Tempo real das listas compartilhadas (T-124b, RN-074) com Postgres e Redis de verdade
 * (`TESTES_INTEGRACAO=1`): a API escuta numa porta e o `socket.io-client` conecta em `/v1/ws`.
 * Confere o token na conexão, a sala só para quem tem acesso, o aviso a cada mudança e a saída da
 * sala de quem foi removido.
 */
import { randomInt, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Compartilhamento } from '@mony/shared/compartilhamentos';
import type { DetalheLista } from '@mony/shared/listas';
import {
  CAMINHO_WS,
  EVENTOS_TEMPO_REAL,
  type ListaMudou,
  type RespostaSalaLista,
} from '@mony/shared/tempo-real';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: listas em tempo real', () => {
  let app: NestFastifyApplication;
  let endereco: string;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo('2026-10-15T15:00:00Z'))
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    endereco = `http://127.0.0.1:${String(port)}`;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo(nome: string) {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome,
        email,
        telefone: '(11) 98765-4321',
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
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso, email };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  async function ok<T>(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ): Promise<T> {
    const resposta = await app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
    expect(resposta.statusCode, resposta.body).toBeLessThan(300);
    return resposta.body === '' ? (undefined as T) : resposta.json<T>();
  }

  /** Conecta e guarda os avisos que chegam, para o teste esperar por eles. */
  function conectar(token: string | undefined) {
    const socket = io(endereco, {
      path: CAMINHO_WS,
      transports: ['websocket'],
      reconnection: false,
      ...(token === undefined ? {} : { auth: { token } }),
    });
    sockets.push(socket);
    const avisos: ListaMudou[] = [];
    socket.on(EVENTOS_TEMPO_REAL.listaMudou, (aviso: ListaMudou) => avisos.push(aviso));
    const conectado = new Promise<void>((resolver, rejeitar) => {
      socket.once('connect', () => {
        resolver();
      });
      socket.once('connect_error', rejeitar);
    });
    return { socket, avisos, conectado };
  }

  type Conexao = ReturnType<typeof conectar>;

  const entrar = (conexao: Conexao, listaId: string) =>
    conexao.socket
      .timeout(5_000)
      .emitWithAck(EVENTOS_TEMPO_REAL.entrarLista, { listaId }) as Promise<RespostaSalaLista>;

  async function esperarAviso(conexao: Conexao, aviso: ListaMudou) {
    const limite = Date.now() + 5_000;
    while (!conexao.avisos.some((a) => a.listaId === aviso.listaId && a.motivo === aviso.motivo)) {
      if (Date.now() > limite) throw new Error(`aviso não chegou: ${JSON.stringify(aviso)}`);
      await new Promise((resolver) => setTimeout(resolver, 20));
    }
  }

  it('sem token ou com token inválido a conexão é recusada com o código', async () => {
    await expect(conectar(undefined).conectado).rejects.toThrow('NAO_AUTENTICADO');
    await expect(conectar('nao-e-um-jwt').conectado).rejects.toThrow('NAO_AUTENTICADO');
  });

  it('o token de segundo plano do aparelho (T-088b) não abre o tempo real', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const { token } = await ok<{ token: string }>(ana, 'POST', '/me/token-segundo-plano');
    await expect(conectar(token).conectado).rejects.toThrow('ACESSO_NEGADO');
  });

  it('RN-074 só entra na sala quem tem acesso; cada mudança avisa quem está nela', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const bia = await usuarioNovo('Bia Lima');
    const carla = await usuarioNovo('Carla Dias');
    const lista = await ok<DetalheLista>(ana, 'POST', '/listas', {
      nome: 'Mercado',
      categoria: 'mercado',
    });
    const convite = await ok<Compartilhamento>(ana, 'POST', '/compartilhamentos', {
      recurso: 'lista',
      recursoId: lista.id,
      contato: bia.email,
      permissao: 'ver',
    });

    const daAna = conectar(ana.acesso);
    const daBia = conectar(bia.acesso);
    const daCarla = conectar(carla.acesso);
    await Promise.all([daAna.conectado, daBia.conectado, daCarla.conectado]);

    expect(await entrar(daAna, lista.id)).toEqual({ ok: true });
    // Convite pendente ainda não dá acesso, como na API (404 não revela que a lista existe).
    expect(await entrar(daBia, lista.id)).toEqual({ ok: false, codigo: 'NAO_ENCONTRADO' });
    expect(await entrar(daCarla, lista.id)).toEqual({ ok: false, codigo: 'NAO_ENCONTRADO' });
    expect(await entrar(daCarla, 'abc')).toEqual({ ok: false, codigo: 'REQUISICAO_INVALIDA' });

    await ok(bia, 'POST', `/compartilhamentos/${convite.id}/aceitar`);
    await esperarAviso(daAna, { listaId: lista.id, motivo: 'acesso' });
    expect(await entrar(daBia, lista.id)).toEqual({ ok: true });

    // A Bia só vê, mas recebe o aviso quando a Ana põe um item.
    const comLeite = await ok<DetalheLista>(ana, 'POST', `/listas/${lista.id}/itens`, {
      nome: 'Leite',
      precoEstimadoCentavos: 500,
    });
    await esperarAviso(daBia, { listaId: lista.id, motivo: 'itens' });
    await ok(ana, 'PATCH', `/itens/${comLeite.itens[0]?.id ?? ''}`, { comprado: true });
    await ok(ana, 'PATCH', `/listas/${lista.id}`, { nome: 'Mercado do mês' });
    await esperarAviso(daBia, { listaId: lista.id, motivo: 'lista' });

    await ok(ana, 'PATCH', `/compartilhamentos/${convite.id}`, { permissao: 'editar' });
    await esperarAviso(daBia, { listaId: lista.id, motivo: 'acesso' });
    expect(daCarla.avisos).toEqual([]);

    // Sair da sala: os avisos param.
    daBia.avisos.length = 0;
    expect(
      await daBia.socket
        .timeout(5_000)
        .emitWithAck(EVENTOS_TEMPO_REAL.sairLista, { listaId: lista.id }),
    ).toEqual({ ok: true });
    daAna.avisos.length = 0;
    await ok(ana, 'POST', `/listas/${lista.id}/itens`, { nome: 'Pão' });
    await esperarAviso(daAna, { listaId: lista.id, motivo: 'itens' });
    expect(daBia.avisos).toEqual([]);
  });

  it('RN-074 quem é removido sai da sala; a lista excluída avisa e esvazia a sala', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const bia = await usuarioNovo('Bia Lima');
    const lista = await ok<DetalheLista>(ana, 'POST', '/listas', {
      nome: 'Feira',
      categoria: 'mercado',
    });
    const convite = await ok<Compartilhamento>(ana, 'POST', '/compartilhamentos', {
      recurso: 'lista',
      recursoId: lista.id,
      contato: bia.email,
      permissao: 'editar',
    });
    await ok(bia, 'POST', `/compartilhamentos/${convite.id}/aceitar`);

    const daAna = conectar(ana.acesso);
    // Dois aparelhos da Bia: os dois saem da sala.
    const celularBia = conectar(bia.acesso);
    const tabletBia = conectar(bia.acesso);
    await Promise.all([daAna.conectado, celularBia.conectado, tabletBia.conectado]);
    for (const conexao of [daAna, celularBia, tabletBia]) {
      expect(await entrar(conexao, lista.id)).toEqual({ ok: true });
    }

    await ok(bia, 'POST', `/listas/${lista.id}/itens`, { nome: 'Banana' });
    await esperarAviso(daAna, { listaId: lista.id, motivo: 'itens' });

    await ok(ana, 'DELETE', `/compartilhamentos/${convite.id}`);
    await esperarAviso(celularBia, { listaId: lista.id, motivo: 'acesso' });
    await esperarAviso(tabletBia, { listaId: lista.id, motivo: 'acesso' });
    celularBia.avisos.length = 0;
    tabletBia.avisos.length = 0;
    daAna.avisos.length = 0;
    await ok(ana, 'POST', `/listas/${lista.id}/itens`, { nome: 'Maçã' });
    await esperarAviso(daAna, { listaId: lista.id, motivo: 'itens' });
    expect([...celularBia.avisos, ...tabletBia.avisos]).toEqual([]);
    expect(await entrar(celularBia, lista.id)).toEqual({ ok: false, codigo: 'NAO_ENCONTRADO' });

    await ok(ana, 'DELETE', `/listas/${lista.id}`);
    await esperarAviso(daAna, { listaId: lista.id, motivo: 'excluida' });
  });
});
