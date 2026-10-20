/**
 * Integração dos apps de compra (T-121a, RN-104, RN-121) com o Postgres de verdade. Precisa do
 * banco com as migrações aplicadas e do Redis (cadastro):
 * `TESTES_INTEGRACAO=1 pnpm --filter api test`.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { ListaAppsMonitorados, ResultadoAberturaApp } from '@mony/shared/apps-compra';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { formatarCentavos } from '@mony/shared/dinheiro';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { fraseDoOrcamento } from '../src/modulos/apps-compra/apps-compra.service';
import {
  type EnvioDeNotificacoes,
  EnvioNotificacoes,
} from '../src/modulos/notificacoes/envio-notificacoes';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');
const HORA_MS = 3_600_000;

class EnvioAnotado extends EnvioNotificacoes {
  readonly envios: EnvioDeNotificacoes[] = [];

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.envios.push(envio);
    return Promise.resolve();
  }
}

describe('a frase do orçamento de compras no alerta', () => {
  it('mostra o que sobra, o que passou ou convida a olhar o orçamento', () => {
    expect(fraseDoOrcamento(12000)).toBe(
      `Seu orçamento de compras tem ${formatarCentavos(12000)} livres.`,
    );
    expect(fraseDoOrcamento(0)).toBe('Seu orçamento de compras deste mês já acabou.');
    expect(fraseDoOrcamento(-550)).toBe(
      `Seu orçamento de compras já passou ${formatarCentavos(550)} do limite.`,
    );
    expect(fraseDoOrcamento(null)).toBe('Que tal ver quanto ainda cabe no mês antes de comprar?');
  });
});

describe.runIf(ativo)('integração: apps de compra', () => {
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
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    const sessao = resposta.json<{
      usuario: { id: string };
      tokens: { acesso: string; renovacao: string };
    }>();
    await prisma.assinatura.update({
      where: { usuarioId: sessao.usuario.id },
      data: { plano, testeInicio: null, testeFim: null },
    });
    return {
      usuarioId: sessao.usuario.id,
      acesso: sessao.tokens.acesso,
      renovacao: sessao.tokens.renovacao,
    };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

  async function tokenDe(usuario: Usuario): Promise<string> {
    const resposta = await chamar(usuario, 'POST', '/apps-monitorados/token-evento');
    expect(resposta.statusCode, resposta.body).toBe(201);
    return resposta.json<{ token: string }>().token;
  }

  function abrir(token: string | null, identificadorApp: string, abertoEm = AGORA) {
    return app.inject({
      method: 'POST',
      url: '/v1/eventos/app-compra-aberto',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      payload: { identificadorApp, abertoEm: abertoEm.toISOString() },
    });
  }

  async function aberto(token: string, identificadorApp: string, abertoEm = AGORA) {
    const resposta = await abrir(token, identificadorApp, abertoEm);
    expect(resposta.statusCode, resposta.body).toBe(200);
    return resposta.json<ResultadoAberturaApp>();
  }

  const alertas = (usuario: Usuario) =>
    envio.envios
      .filter(({ usuarioId }) => usuarioId === usuario.usuarioId)
      .flatMap(({ notificacoes }) => notificacoes);

  it('lista os apps sugeridos do cadastro e troca a lista inteira', async () => {
    const ana = await usuarioNovo();
    const lista = (await chamar(ana, 'GET', '/apps-monitorados')).json<ListaAppsMonitorados>();
    expect(lista.disponivel).toBe(true);
    expect(lista.itens.map(({ nome }) => nome)).toEqual([
      'AliExpress',
      'Amazon',
      'iFood',
      'Magalu',
      'Mercado Livre',
      'Shein',
      'Shopee',
    ]);

    const mudou = await chamar(ana, 'PUT', '/apps-monitorados', {
      itens: [
        { identificadorApp: 'com.shopee.br', nome: 'Shopee', ativo: true },
        { identificadorApp: 'br.com.brainweb.ifood', nome: 'iFood', ativo: false },
        { identificadorApp: 'com.exemplo.loja', nome: 'Loja', ativo: true },
      ],
    });
    expect(mudou.statusCode, mudou.body).toBe(200);
    expect(
      mudou.json<ListaAppsMonitorados>().itens.map(({ nome, ativo }) => [nome, ativo]),
    ).toEqual([
      ['iFood', false],
      ['Loja', true],
      ['Shopee', true],
    ]);
    const repetido = await chamar(ana, 'PUT', '/apps-monitorados', {
      itens: [
        { identificadorApp: 'com.shopee.br', nome: 'Shopee', ativo: true },
        { identificadorApp: 'com.shopee.br', nome: 'Shopee 2', ativo: true },
      ],
    });
    expect(repetido.statusCode).toBe(400);

    // No gratuito a lista fica, mas o recurso não está no plano (RN-121).
    const bia = await usuarioNovo('gratuito');
    expect(
      (await chamar(bia, 'GET', '/apps-monitorados')).json<ListaAppsMonitorados>().disponivel,
    ).toBe(false);
  });

  it('RN-121 o token de evento só no plano pago; sem token que vale, 401', async () => {
    const gratuito = await usuarioNovo('gratuito');
    const recusado = await chamar(gratuito, 'POST', '/apps-monitorados/token-evento');
    expect(recusado.statusCode).toBe(403);
    expect(recusado.json()).toMatchObject({
      erro: { codigo: 'RECURSO_EXIGE_PLANO_PAGO', detalhes: { recurso: 'apps_compra' } },
    });

    const ana = await usuarioNovo();
    const token = await tokenDe(ana);
    expect(token).toMatch(/^mte_/);
    expect((await abrir(null, 'com.shopee.br')).statusCode).toBe(401);
    expect((await abrir(`${token}x`, 'com.shopee.br')).statusCode).toBe(401);
    // O token de acesso do app não serve no lugar do de evento.
    expect((await abrir(ana.acesso, 'com.shopee.br')).statusCode).toBe(401);
    // Pedir de novo troca o token: o anterior para de valer.
    const novo = await tokenDe(ana);
    expect((await abrir(token, 'com.shopee.br')).statusCode).toBe(401);
    expect((await abrir(novo, 'com.shopee.br')).statusCode).toBe(200);
  });

  it('RN-104 um alerta por app no intervalo, com o orçamento de compras', async () => {
    const ana = await usuarioNovo();
    const token = await tokenDe(ana);

    expect(await aberto(token, 'com.shopee.br')).toEqual({ alertado: true, motivo: null });
    expect(alertas(ana)).toEqual([
      expect.objectContaining({
        tipo: 'app_compra',
        titulo: 'Abriu a Shopee?',
        corpo: 'Que tal ver quanto ainda cabe no mês antes de comprar?',
        linkInterno: 'mony://orcamentos?competencia=2026-10',
      }),
    ]);
    // A mesma loja dentro de 24 h (o padrão do painel) não avisa de novo.
    expect(await aberto(token, 'com.shopee.br', new Date(AGORA.getTime() - 1_000))).toEqual({
      alertado: false,
      motivo: 'intervalo',
    });

    // Com orçamento na categoria Compras, a mensagem diz quanto sobra.
    const compras = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: ana.usuarioId, nome: 'Compras', padrao: true },
    });
    const orcamento = await chamar(ana, 'PUT', '/orcamentos', {
      categoriaId: compras.id,
      valorLimiteCentavos: 12000,
    });
    expect(orcamento.statusCode, orcamento.body).toBeLessThan(300);
    expect(await aberto(token, 'com.mercadolibre')).toEqual({ alertado: true, motivo: null });
    expect(alertas(ana).at(-1)).toMatchObject({
      titulo: 'Abriu a Mercado Livre?',
      corpo: `Seu orçamento de compras tem ${formatarCentavos(12000)} livres.`,
    });

    // Fora da lista, desligado nela ou aberto há mais de uma hora: sem alerta.
    await chamar(ana, 'PUT', '/apps-monitorados', {
      itens: [{ identificadorApp: 'com.zzkko', nome: 'Shein', ativo: false }],
    });
    expect(await aberto(token, 'com.zzkko')).toMatchObject({ motivo: 'nao_monitorado' });
    expect(await aberto(token, 'com.desconhecido')).toMatchObject({ motivo: 'nao_monitorado' });
    await chamar(ana, 'PUT', '/apps-monitorados', {
      itens: [{ identificadorApp: 'com.zzkko', nome: 'Shein', ativo: true }],
    });
    expect(await aberto(token, 'com.zzkko', new Date(AGORA.getTime() - 2 * HORA_MS))).toMatchObject(
      { motivo: 'antigo' },
    );
    expect(alertas(ana)).toHaveLength(2);
  });

  it('RN-100 RN-101 alerta desligado ou no silêncio não sai e não gasta o intervalo', async () => {
    const ana = await usuarioNovo();
    const token = await tokenDe(ana);
    await prisma.preferenciaAlerta.upsert({
      where: { usuarioId_tipoAlerta: { usuarioId: ana.usuarioId, tipoAlerta: 'app_compra' } },
      create: { usuarioId: ana.usuarioId, tipoAlerta: 'app_compra', ativo: false },
      update: { ativo: false },
    });
    expect(await aberto(token, 'com.shopee.br')).toEqual({ alertado: false, motivo: 'desligado' });

    await prisma.preferenciaAlerta.updateMany({
      where: { usuarioId: ana.usuarioId, tipoAlerta: 'app_compra' },
      data: { ativo: true, silencioInicio: '11:00', silencioFim: '13:00' },
    });
    expect(await aberto(token, 'com.shopee.br')).toEqual({ alertado: false, motivo: 'silencio' });
    // Nada gravado na central para mandar depois do silêncio.
    expect(await prisma.notificacao.count({ where: { usuarioId: ana.usuarioId } })).toBe(0);

    await prisma.preferenciaAlerta.updateMany({
      where: { usuarioId: ana.usuarioId, tipoAlerta: 'app_compra' },
      data: { silencioInicio: null, silencioFim: null },
    });
    expect(await aberto(token, 'com.shopee.br')).toEqual({ alertado: true, motivo: null });
  });

  it('RN-121 o token cai ao sair do aparelho, ao desligar e ao perder o plano pago', async () => {
    const ana = await usuarioNovo();
    const saiu = await tokenDe(ana);
    const sair = await app.inject({
      method: 'POST',
      url: '/v1/auth/sair',
      payload: { renovacao: ana.renovacao },
    });
    expect(sair.statusCode).toBe(204);
    expect((await abrir(saiu, 'com.shopee.br')).statusCode).toBe(401);

    const bia = await usuarioNovo();
    const desligou = await tokenDe(bia);
    expect((await chamar(bia, 'DELETE', '/apps-monitorados/token-evento')).statusCode).toBe(204);
    expect((await abrir(desligou, 'com.shopee.br')).statusCode).toBe(401);

    const caio = await usuarioNovo();
    const plano = await tokenDe(caio);
    await prisma.assinatura.update({
      where: { usuarioId: caio.usuarioId },
      data: { plano: 'gratuito' },
    });
    const semPlano = await abrir(plano, 'com.shopee.br');
    expect(semPlano.statusCode).toBe(403);
    expect(semPlano.json()).toMatchObject({ erro: { codigo: 'RECURSO_EXIGE_PLANO_PAGO' } });
    // Voltar ao pago não religa o token: o app pede outro ao ligar o recurso.
    await prisma.assinatura.update({
      where: { usuarioId: caio.usuarioId },
      data: { plano: 'mensal' },
    });
    expect((await abrir(plano, 'com.shopee.br')).statusCode).toBe(401);
  });
});
