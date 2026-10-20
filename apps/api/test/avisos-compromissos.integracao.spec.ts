/**
 * Aviso do compromisso com antecedência (T-085d, doc 09). A frase sem banco; a rotina
 * `avisar-compromissos` (chamada direto) e a preferência com o Postgres de verdade
 * (`TESTES_INTEGRACAO=1`). O envio do push é anotado.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Compromisso } from '@mony/shared/agenda';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { PreferenciasAlerta } from '@mony/shared/notificacoes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { avisoDoCompromisso, AvisosCompromissos } from '../src/modulos/agenda/avisos-compromissos';
import {
  type EnvioDeNotificacoes,
  EnvioNotificacoes,
} from '../src/modulos/notificacoes/envio-notificacoes';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

const MINUTO = 60_000;
/** Um dia longe dos outros testes: os compromissos dele são só destes. */
const DEZ_DA_MANHA = new Date('2031-03-10T13:00:00Z');
const antes = (minutos: number, de = DEZ_DA_MANHA) => new Date(de.getTime() - minutos * MINUTO);
const FUSO = 'America/Sao_Paulo';

class EnvioAnotado extends EnvioNotificacoes {
  readonly envios: EnvioDeNotificacoes[] = [];

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.envios.push(envio);
    return Promise.resolve();
  }
}

describe('a frase do aviso do compromisso (T-085d)', () => {
  const dentista = { titulo: 'Dentista', inicio: DEZ_DA_MANHA, local: null, fuso: FUSO };

  it('título com a hora curta e, no corpo, quanto falta e o local', () => {
    expect(avisoDoCompromisso(dentista, antes(30))).toEqual({
      titulo: 'Dentista às 10h',
      corpo: 'Em 30 min',
    });
    expect(
      avisoDoCompromisso(
        { ...dentista, inicio: new Date(DEZ_DA_MANHA.getTime() + 30 * MINUTO), local: 'Clínica' },
        antes(60),
      ),
    ).toEqual({ titulo: 'Dentista às 10h30', corpo: 'Em 1 h 30 min · Clínica' });
    expect(avisoDoCompromisso(dentista, antes(60)).corpo).toBe('Em 1 h');
    expect(avisoDoCompromisso(dentista, DEZ_DA_MANHA).corpo).toBe('Começa agora');
  });

  it('no dia seguinte, no fuso da pessoa, diz "amanhã"', () => {
    expect(avisoDoCompromisso(dentista, antes(12 * 60)).titulo).toBe('Dentista amanhã às 10h');
    expect(avisoDoCompromisso({ ...dentista, fuso: 'Asia/Tokyo' }, antes(12 * 60)).titulo).toBe(
      'Dentista às 22h',
    );
  });
});

describe.runIf(ativo)('integração: aviso do compromisso (T-085d)', () => {
  let app: NestFastifyApplication;
  let avisos: AvisosCompromissos;
  const envio = new EnvioAnotado();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(antes(24 * 60)))
      .overrideProvider(EnvioNotificacoes)
      .useValue(envio)
      .overrideProvider(getQueueToken(FILAS.notificacoes))
      .useValue(criarFilaFalsa())
      .overrideProvider(getQueueToken(FILAS.agenda))
      .useValue(criarFilaFalsa())
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    avisos = app.get(AvisosCompromissos);
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
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    usuario: Usuario,
    method: 'POST' | 'PATCH' | 'PUT' | 'GET',
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

  async function compromisso(usuario: Usuario, inicio: Date, local?: string) {
    const resposta = await chamar(usuario, 'POST', '/compromissos', {
      titulo: 'Dentista',
      inicio: inicio.toISOString(),
      ...(local === undefined ? {} : { local }),
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return resposta.json<Compromisso>();
  }

  function avisosDe(usuarioId: string) {
    return prisma.notificacao.findMany({
      where: { usuarioId, tipo: 'compromisso' },
      select: { titulo: true, corpo: true, chaveUnica: true, linkInterno: true },
      orderBy: { criadoEm: 'asc' },
    });
  }

  it('avisa 30 minutos antes por padrão, uma vez só, urgente e abrindo a agenda', async () => {
    const ana = await usuarioNovo();
    const { id } = await compromisso(ana, DEZ_DA_MANHA, 'Clínica');

    await avisos.avisar(antes(31));
    expect(await avisosDe(ana.usuarioId)).toEqual([]);

    await avisos.avisar(new Date(antes(30).getTime() + 20_000));
    await avisos.avisar(antes(29));
    expect(await avisosDe(ana.usuarioId)).toEqual([
      {
        titulo: 'Dentista às 10h',
        corpo: 'Em 30 min · Clínica',
        chaveUnica: `compromisso:${id}:${DEZ_DA_MANHA.toISOString()}`,
        linkInterno: 'mony://agenda',
      },
    ]);
    // Urgente: sai na hora, mesmo se houver silêncio.
    expect(envio.envios.some((e) => e.usuarioId === ana.usuarioId)).toBe(true);
  });

  it('o compromisso que muda de hora avisa de novo para o novo início', async () => {
    const ana = await usuarioNovo();
    const { id } = await compromisso(ana, DEZ_DA_MANHA);
    await avisos.avisar(antes(30));

    const onze = new Date(DEZ_DA_MANHA.getTime() + 60 * MINUTO);
    const resposta = await chamar(ana, 'PATCH', `/compromissos/${id}`, {
      inicio: onze.toISOString(),
    });
    expect(resposta.statusCode).toBe(200);
    await avisos.avisar(antes(30, onze));

    expect((await avisosDe(ana.usuarioId)).map(({ titulo }) => titulo)).toEqual([
      'Dentista às 10h',
      'Dentista às 11h',
    ]);
  });

  it('segue a antecedência da preferência e não avisa com o tipo desligado', async () => {
    const ana = await usuarioNovo();
    const bia = await usuarioNovo();
    expect(
      (
        await chamar(ana, 'PUT', '/preferencias-alerta', {
          tipos: [{ tipo: 'compromisso', antecedenciaMinutos: 0 }],
        })
      ).statusCode,
    ).toBe(200);
    await chamar(bia, 'PUT', '/preferencias-alerta', {
      tipos: [{ tipo: 'compromisso', ativo: false }],
    });
    const preferencias = (
      await chamar(ana, 'GET', '/preferencias-alerta')
    ).json<PreferenciasAlerta>();
    expect(preferencias.tipos.find(({ tipo }) => tipo === 'compromisso')).toMatchObject({
      ativo: true,
      antecedenciaMinutos: 0,
    });
    await compromisso(ana, DEZ_DA_MANHA);
    await compromisso(bia, DEZ_DA_MANHA);

    await avisos.avisar(antes(30));
    expect(await avisosDe(ana.usuarioId)).toEqual([]);
    await avisos.avisar(DEZ_DA_MANHA);
    expect((await avisosDe(ana.usuarioId)).map(({ corpo }) => corpo)).toEqual(['Começa agora']);
    expect(await avisosDe(bia.usuarioId)).toEqual([]);
  });

  it('a antecedência vai de 0 a 1 dia', async () => {
    const ana = await usuarioNovo();
    const resposta = await chamar(ana, 'PUT', '/preferencias-alerta', {
      tipos: [{ tipo: 'compromisso', antecedenciaMinutos: 24 * 60 + 1 }],
    });
    expect(resposta.statusCode).toBe(400);
  });
});
