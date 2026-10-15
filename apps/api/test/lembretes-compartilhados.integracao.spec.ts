/**
 * Lembretes compartilhados (T-124c, RN-074) com Postgres de verdade (`TESTES_INTEGRACAO=1`): o
 * convite para o lembrete, o que `ver` e `editar` podem fazer, e o aviso da rotina por minuto para
 * quem aceitou. O canal de envio só anota, e a fila `notificacoes` é falsa.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Compartilhamento, ListaCompartilhamentos } from '@mony/shared/compartilhamentos';
import type { Lembrete, ListaLembretes } from '@mony/shared/lembretes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { DisparoLembretes } from '../src/modulos/lembretes/disparo-lembretes';
import {
  type EnvioDeNotificacoes,
  EnvioNotificacoes,
} from '../src/modulos/notificacoes/envio-notificacoes';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');

class EnvioAnotado extends EnvioNotificacoes {
  readonly envios: EnvioDeNotificacoes[] = [];

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.envios.push(envio);
    return Promise.resolve();
  }
}

describe.runIf(ativo)('integração: lembretes compartilhados', () => {
  let app: NestFastifyApplication;
  const envio = new EnvioAnotado();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(AGORA))
      .overrideProvider(EnvioNotificacoes)
      .useValue(envio)
      .overrideProvider(getQueueToken(FILAS.notificacoes))
      .useValue(criarFilaFalsa())
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
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
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

  const criar = (dono: Usuario, dados: Record<string, unknown>) =>
    chamar(dono, 'POST', '/lembretes', { canais: ['push'], ...dados }).then(ok<Lembrete>);

  /** Convida e, se pedido, aceita. */
  async function compartilhar(
    dono: Usuario,
    lembrete: Lembrete,
    convidado: Usuario,
    permissao: 'ver' | 'editar',
    aceitar = true,
  ) {
    const convite = await ok<Compartilhamento>(
      await chamar(dono, 'POST', '/compartilhamentos', {
        recurso: 'lembrete',
        recursoId: lembrete.id,
        contato: convidado.email,
        permissao,
      }),
    );
    if (aceitar)
      await ok(await chamar(convidado, 'POST', `/compartilhamentos/${convite.id}/aceitar`));
    return convite;
  }

  const disparar = (instante: string) => app.get(DisparoLembretes).disparar(new Date(instante));

  const enviadas = (usuario: Usuario, desde: number) =>
    envio.envios
      .slice(desde)
      .filter(({ usuarioId }) => usuarioId === usuario.usuarioId)
      .flatMap(({ notificacoes }) => notificacoes);

  it('RN-074 convite para o lembrete: só depois de aceito ele aparece, com o dono', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const bia = await usuarioNovo('Bia Lima');
    const remedio = await criar(ana, {
      titulo: 'Remédio da vó',
      dataHora: '2026-10-16T11:00:00.000Z',
    });

    const convite = await compartilhar(ana, remedio, bia, 'ver', false);
    expect(convite).toMatchObject({
      recurso: 'lembrete',
      recursoId: remedio.id,
      recursoNome: 'Remédio da vó',
      status: 'pendente',
    });
    expect((await chamar(bia, 'GET', `/lembretes/${remedio.id}`)).statusCode).toBe(404);
    expect((await ok<ListaLembretes>(await chamar(bia, 'GET', '/lembretes'))).itens).toEqual([]);

    await ok(await chamar(bia, 'POST', `/compartilhamentos/${convite.id}/aceitar`));
    const daBia = await ok<ListaLembretes>(await chamar(bia, 'GET', '/lembretes'));
    expect(daBia.itens).toMatchObject([
      {
        id: remedio.id,
        titulo: 'Remédio da vó',
        acesso: 'ver',
        dono: { id: ana.usuarioId, nome: 'Ana Souza' },
        compartilhadoCom: 1,
      },
    ]);
    expect(await ok<Lembrete>(await chamar(ana, 'GET', `/lembretes/${remedio.id}`))).toMatchObject({
      acesso: 'dono',
      dono: null,
      compartilhadoCom: 1,
    });
    expect(
      (await ok<ListaCompartilhamentos>(await chamar(bia, 'GET', '/compartilhamentos'))).recebidos,
    ).toMatchObject([{ recurso: 'lembrete', recursoNome: 'Remédio da vó', status: 'aceito' }]);
  });

  it('RN-074 ver só vê; editar conclui e adia para todos; mudar, excluir e convidar são do dono', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const bia = await usuarioNovo('Bia Lima');
    const carla = await usuarioNovo('Carla Dias');
    const dani = await usuarioNovo('Dani Reis');
    const conta = await criar(ana, {
      titulo: 'Pagar a luz',
      dataHora: '2026-10-16T11:00:00.000Z',
    });
    await compartilhar(ana, conta, bia, 'ver');
    await compartilhar(ana, conta, carla, 'editar');

    // Ver: lê, mas não conclui nem adia.
    const daBia = await chamar(bia, 'POST', `/lembretes/${conta.id}/concluir`, {});
    expect(daBia.statusCode).toBe(403);
    expect(daBia.json<{ erro: { mensagem: string } }>().erro.mensagem).toBe(
      'Você só pode ver este lembrete.',
    );
    expect(
      (await chamar(bia, 'POST', `/lembretes/${conta.id}/adiar`, { opcao: '1h' })).statusCode,
    ).toBe(403);
    // Quem não foi convidado nem sabe que existe.
    expect((await chamar(dani, 'GET', `/lembretes/${conta.id}`)).statusCode).toBe(404);
    expect((await chamar(dani, 'POST', `/lembretes/${conta.id}/concluir`, {})).statusCode).toBe(
      404,
    );

    // Editar: a soneca da Carla vale para a Ana.
    const adiado = await ok<Lembrete>(
      await chamar(carla, 'POST', `/lembretes/${conta.id}/adiar`, { opcao: '1h' }),
    );
    expect(adiado).toMatchObject({ adiadoAte: '2026-10-15T16:00:00.000Z', acesso: 'editar' });
    expect(await ok<Lembrete>(await chamar(ana, 'GET', `/lembretes/${conta.id}`))).toMatchObject({
      adiadoAte: '2026-10-15T16:00:00.000Z',
    });

    // O resto é do dono.
    const mudar = await chamar(carla, 'PATCH', `/lembretes/${conta.id}`, { titulo: 'Outro' });
    expect(mudar.statusCode).toBe(403);
    expect(mudar.json<{ erro: { mensagem: string } }>().erro.mensagem).toBe(
      'Só o dono do lembrete pode fazer isso.',
    );
    expect((await chamar(carla, 'DELETE', `/lembretes/${conta.id}`)).statusCode).toBe(403);
    const convidar = await chamar(carla, 'POST', '/compartilhamentos', {
      recurso: 'lembrete',
      recursoId: conta.id,
      contato: dani.email,
      permissao: 'ver',
    });
    expect(convidar.statusCode).toBe(403);
    expect(codigo(convidar)).toBe('ACESSO_NEGADO');

    // O [Feito] da Carla conclui para todos.
    const feito = await ok<Lembrete>(
      await chamar(carla, 'POST', `/lembretes/${conta.id}/concluir`, {}),
    );
    expect(feito.status).toBe('concluido');
    expect(
      (await ok<ListaLembretes>(await chamar(bia, 'GET', '/lembretes?status=concluido'))).itens,
    ).toMatchObject([{ id: conta.id, status: 'concluido', acesso: 'ver' }]);
  });

  it('RN-074 RN-077 quem aceitou recebe o aviso, mesmo com o dono só no alarme; excluir tira os convites', async () => {
    const ana = await usuarioNovo('Ana Souza');
    const bia = await usuarioNovo('Bia Lima');
    const carla = await usuarioNovo('Carla Dias');
    // O dono tem Android e só o alarme: o push não vai para ele, mas vai para quem foi convidado.
    const aniversario = await criar(ana, {
      titulo: 'Aniversário do Léo',
      dataHora: '2026-10-17T13:00:00.000Z',
      canais: ['alarme'],
    });
    await compartilhar(ana, aniversario, bia, 'ver');
    await compartilhar(ana, aniversario, carla, 'editar', false);
    const desde = envio.envios.length;

    await disparar('2026-10-17T13:00:00Z');
    expect(enviadas(ana, desde)).toEqual([]);
    expect(enviadas(bia, desde)).toEqual([
      expect.objectContaining({
        tipo: 'lembrete',
        titulo: 'Aniversário do Léo',
        corpo: 'Lembrete das 10:00, de Ana Souza',
        linkInterno: `mony://lembretes/${aniversario.id}?ocorrencia=${String(
          Date.parse('2026-10-17T13:00:00.000Z'),
        )}`,
      }),
    ]);
    // Convite pendente não recebe.
    expect(enviadas(carla, desde)).toEqual([]);

    // Excluir (só o dono): o lembrete some para todos, e os convites também.
    expect((await chamar(ana, 'DELETE', `/lembretes/${aniversario.id}`)).statusCode).toBe(204);
    expect((await chamar(bia, 'GET', `/lembretes/${aniversario.id}`)).statusCode).toBe(404);
    expect(
      (await ok<ListaCompartilhamentos>(await chamar(bia, 'GET', '/compartilhamentos'))).recebidos,
    ).toEqual([]);
    expect(
      (await ok<ListaCompartilhamentos>(await chamar(carla, 'GET', '/compartilhamentos')))
        .recebidos,
    ).toEqual([]);
  });
});
