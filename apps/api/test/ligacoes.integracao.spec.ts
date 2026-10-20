/**
 * Integração do lembrete por ligação (RN-078, RN-121, T-122a) com o Postgres de verdade e o
 * provedor de voz falso. Precisa do banco com as migrações aplicadas e do Redis (cadastro):
 * `TESTES_INTEGRACAO=1 pnpm --filter api test`.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Lembrete } from '@mony/shared/lembretes';
import type { Perfil } from '@mony/shared/usuario';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { VozFake } from '../src/integracoes/voz/voz-fake';
import { VozProvider } from '../src/integracoes/voz/voz.provider';
import { DisparoLembretes } from '../src/modulos/lembretes/disparo-lembretes';
import {
  type DadosJobLigarLembrete,
  JOB_LIGAR_LEMBRETE,
  LigacoesLembrete,
} from '../src/modulos/lembretes/ligacoes-lembrete';
import {
  type EnvioDeNotificacoes,
  EnvioNotificacoes,
} from '../src/modulos/notificacoes/envio-notificacoes';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** Quinta, 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');
/** Sexta, 16/10/2026, 08:00 em São Paulo. */
const SEXTA_8H = '2026-10-16T11:00:00.000Z';

class EnvioAnotado extends EnvioNotificacoes {
  readonly envios: EnvioDeNotificacoes[] = [];

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.envios.push(envio);
    return Promise.resolve();
  }
}

describe.runIf(ativo)('integração: lembrete por ligação', () => {
  let app: NestFastifyApplication;
  let voz: VozFake;
  const envio = new EnvioAnotado();
  const filaLembretes = criarFilaFalsa();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(AGORA))
      .overrideProvider(EnvioNotificacoes)
      .useValue(envio)
      .overrideProvider(getQueueToken(FILAS.notificacoes))
      .useValue(criarFilaFalsa())
      .overrideProvider(getQueueToken(FILAS.lembretes))
      .useValue(filaLembretes)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    voz = app.get<VozProvider, VozFake>(VozProvider);
  });

  beforeEach(() => {
    filaLembretes.add.mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo(plano: 'mensal' | 'gratuito' = 'mensal') {
    // Um celular por pessoa, para achar o SMS dela no provedor falso.
    const telefone = `+55119${String(randomInt(10_000_000, 99_999_999))}`;
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone,
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    await prisma.assinatura.update({
      where: { usuarioId: sessao.usuario.id },
      data: { plano, testeInicio: null, testeFim: null },
    });
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso, telefone };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  /** O código do último SMS que foi para o telefone. */
  function codigoDoSms(telefone: string): string {
    const sms = voz.sms.filter(({ para }) => para === telefone).at(-1);
    const codigo = /\d{6}/.exec(sms?.texto ?? '')?.[0];
    if (codigo === undefined) throw new Error(`Nenhum SMS para ${telefone}`);
    return codigo;
  }

  async function verificar(usuario: Usuario): Promise<void> {
    expect((await chamar(usuario, 'POST', '/me/telefone/codigo')).statusCode).toBe(204);
    const resposta = await chamar(usuario, 'POST', '/me/telefone/verificar', {
      codigo: codigoDoSms(usuario.telefone),
    });
    expect(resposta.statusCode, resposta.body).toBe(200);
  }

  async function lembreteComLigacao(usuario: Usuario, canais = ['ligacao']): Promise<Lembrete> {
    const resposta = await chamar(usuario, 'POST', '/lembretes', {
      titulo: 'Tomar remédio',
      dataHora: SEXTA_8H,
      canais,
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return resposta.json<Lembrete>();
  }

  /** Toca na hora e devolve os jobs de ligação que a rotina pôs na fila. */
  async function dispararLigacoes(usuario: Usuario): Promise<DadosJobLigarLembrete[]> {
    await app.get(DisparoLembretes).disparar(new Date(SEXTA_8H));
    return filaLembretes.add.mock.calls
      .filter(([nome]) => nome === JOB_LIGAR_LEMBRETE)
      .map(([, dados]) => dados as DadosJobLigarLembrete)
      .filter(({ usuarioId }) => usuarioId === usuario.usuarioId);
  }

  const pushes = (usuario: Usuario) =>
    envio.envios
      .filter(({ usuarioId }) => usuarioId === usuario.usuarioId)
      .flatMap(({ notificacoes }) => notificacoes);

  it('RN-078 verifica o telefone pelo código do SMS; trocar o telefone tira a verificação', async () => {
    const ana = await usuarioNovo();
    expect((await chamar(ana, 'POST', '/me/telefone/codigo')).statusCode).toBe(204);
    const codigo = codigoDoSms(ana.telefone);
    const errado = codigo === '000000' ? '111111' : '000000';
    const recusado = await chamar(ana, 'POST', '/me/telefone/verificar', { codigo: errado });
    expect(recusado.statusCode).toBe(400);
    expect(recusado.json()).toMatchObject({ erro: { codigo: 'CODIGO_INVALIDO' } });

    const certo = await chamar(ana, 'POST', '/me/telefone/verificar', { codigo });
    expect(certo.statusCode, certo.body).toBe(200);
    expect(certo.json<Perfil>()).toMatchObject({
      telefone: ana.telefone,
      telefoneVerificado: true,
    });
    // Já verificado: não manda outro SMS.
    const enviados = voz.sms.length;
    expect((await chamar(ana, 'POST', '/me/telefone/codigo')).statusCode).toBe(204);
    expect(voz.sms).toHaveLength(enviados);

    // Telefone novo: perde a verificação, e o código pedido antes da troca não vale para ele.
    const outro = `+55119${String(randomInt(10_000_000, 99_999_999))}`;
    await prisma.usuario.update({
      where: { id: ana.usuarioId },
      data: { telefoneVerificadoEm: null },
    });
    expect((await chamar(ana, 'POST', '/me/telefone/codigo')).statusCode).toBe(204);
    const antigo = codigoDoSms(ana.telefone);
    const perfil = await chamar(ana, 'PATCH', '/me', { telefone: outro });
    expect(perfil.json<Perfil>()).toMatchObject({ telefone: outro, telefoneVerificado: false });
    const vencido = await chamar(ana, 'POST', '/me/telefone/verificar', { codigo: antigo });
    expect(vencido.json()).toMatchObject({ erro: { codigo: 'CODIGO_EXPIRADO' } });
  });

  it('RN-078 RN-121 a ligação no lembrete só no plano pago e com o telefone verificado', async () => {
    const gratuito = await usuarioNovo('gratuito');
    const semPlano = await chamar(gratuito, 'POST', '/lembretes', {
      titulo: 'Tomar remédio',
      dataHora: SEXTA_8H,
      canais: ['push', 'ligacao'],
    });
    expect(semPlano.statusCode).toBe(403);
    expect(semPlano.json()).toMatchObject({
      erro: { codigo: 'RECURSO_EXIGE_PLANO_PAGO', detalhes: { recurso: 'ligacao' } },
    });

    const ana = await usuarioNovo();
    const semTelefone = await chamar(ana, 'POST', '/lembretes', {
      titulo: 'Tomar remédio',
      dataHora: SEXTA_8H,
      canais: ['ligacao'],
    });
    expect(semTelefone.statusCode).toBe(409);
    expect(semTelefone.json()).toMatchObject({ erro: { codigo: 'TELEFONE_NAO_VERIFICADO' } });

    // Pôr a ligação num lembrete que já existe passa pela mesma conferência.
    const soPush = await lembreteComLigacao(ana, ['push']);
    const mudar = await chamar(ana, 'PATCH', `/lembretes/${soPush.id}`, {
      canais: ['push', 'ligacao'],
    });
    expect(mudar.json()).toMatchObject({ erro: { codigo: 'TELEFONE_NAO_VERIFICADO' } });

    await verificar(ana);
    expect((await lembreteComLigacao(ana)).canais).toEqual(['ligacao']);
    const mudou = await chamar(ana, 'PATCH', `/lembretes/${soPush.id}`, {
      canais: ['push', 'ligacao'],
    });
    expect(mudou.statusCode, mudou.body).toBe(200);

    // De volta ao gratuito, dá para tirar o push do lembrete que já tem a ligação.
    await prisma.assinatura.update({
      where: { usuarioId: ana.usuarioId },
      data: { plano: 'gratuito' },
    });
    const tirar = await chamar(ana, 'PATCH', `/lembretes/${soPush.id}`, { canais: ['ligacao'] });
    expect(tirar.statusCode, tirar.body).toBe(200);
  });

  it('RN-078 na hora, liga uma vez por aviso para o telefone verificado', async () => {
    const ana = await usuarioNovo();
    await verificar(ana);
    const lembrete = await lembreteComLigacao(ana, ['push', 'ligacao']);
    const jobs = await dispararLigacoes(ana);
    expect(jobs).toEqual([
      expect.objectContaining({
        lembreteId: lembrete.id,
        chaveUnica: `lembrete:${lembrete.id}:${SEXTA_8H}`,
        titulo: 'Tomar remédio',
        comPush: true,
      }),
    ]);
    const [job] = jobs as [DadosJobLigarLembrete];
    const ligacoes = app.get(LigacoesLembrete);
    const resultado = await ligacoes.ligar(job);
    expect(resultado).toMatchObject({ resultado: 'ligou' });
    expect(voz.ligacoes.at(-1)).toMatchObject({
      para: ana.telefone,
      texto: 'Oi, aqui é a Mony, com o seu lembrete: Tomar remédio.',
    });
    // O job repetido não liga de novo.
    expect(await ligacoes.ligar(job)).toEqual({ resultado: 'ja_ligou' });
    const gravadas = await prisma.ligacao.findMany({ where: { usuarioId: ana.usuarioId } });
    expect(gravadas).toEqual([
      expect.objectContaining({
        lembreteId: lembrete.id,
        status: 'enfileirada',
        provedorId: resultado.resultado === 'ligou' ? resultado.provedorId : null,
      }),
    ]);
    expect(
      (await prisma.lembrete.findUniqueOrThrow({ where: { id: lembrete.id } })).ultimaLigacaoEm,
    ).toEqual(AGORA);
  });

  it('RN-078 no limite do mês não liga; sem o push no lembrete, o aviso vai por push', async () => {
    const ana = await usuarioNovo();
    await verificar(ana);
    const lembrete = await lembreteComLigacao(ana);
    const [job] = (await dispararLigacoes(ana)) as [DadosJobLigarLembrete];
    expect(job.comPush).toBe(false);
    // Só com a ligação, a rotina não manda push: quem manda é a ligação que não sai.
    expect(pushes(ana)).toEqual([]);
    // Dez ligações neste mês (o padrão do painel); a do mês passado não conta.
    await prisma.ligacao.createMany({
      data: [
        ...Array.from({ length: 10 }, () => ({
          usuarioId: ana.usuarioId,
          status: 'concluida',
          iniciadaEm: new Date('2026-10-01T03:00:00Z'),
        })),
        { usuarioId: ana.usuarioId, status: 'falhou', iniciadaEm: AGORA },
      ],
    });
    const ligacoes = app.get(LigacoesLembrete);
    const feitas = voz.ligacoes.length;
    expect(await ligacoes.ligar(job)).toEqual({ resultado: 'sem_ligacao', motivo: 'limite' });
    expect(voz.ligacoes).toHaveLength(feitas);
    expect(pushes(ana)).toEqual([
      expect.objectContaining({
        titulo: 'Tomar remédio',
        corpo:
          'Lembrete das 08:00. Você chegou às 10 ligações deste mês; este lembrete veio por notificação.',
        linkInterno: expect.stringContaining(lembrete.id) as unknown,
      }),
    ]);

    // As dez passam para 30/09 no fuso de São Paulo: o mês de outubro fica livre.
    await prisma.ligacao.updateMany({
      where: { usuarioId: ana.usuarioId, status: 'concluida' },
      data: { iniciadaEm: new Date('2026-10-01T02:59:00Z') },
    });
    expect(await ligacoes.ligar(job)).toMatchObject({ resultado: 'ligou' });
  });

  it('RN-121 RN-078 de volta ao gratuito ou com o provedor fora do ar, o aviso vai por push', async () => {
    const ana = await usuarioNovo();
    await verificar(ana);
    await lembreteComLigacao(ana);
    const [job] = (await dispararLigacoes(ana)) as [DadosJobLigarLembrete];
    const ligacoes = app.get(LigacoesLembrete);

    // Falha que dá para repetir: sobe o erro, para o BullMQ tentar de novo.
    voz.falharProxima(2);
    await expect(ligacoes.ligar(job, false)).rejects.toThrow('Falha simulada');
    expect(pushes(ana)).toEqual([]);
    // Na última tentativa, vai por push.
    expect(await ligacoes.ligar(job, true)).toEqual({ resultado: 'sem_ligacao', motivo: 'falha' });
    expect(pushes(ana)).toHaveLength(1);
    expect(
      (await prisma.ligacao.findMany({ where: { usuarioId: ana.usuarioId } })).map(
        ({ status }) => status,
      ),
    ).toEqual(['falhou']);

    const bia = await usuarioNovo();
    await verificar(bia);
    await lembreteComLigacao(bia);
    const [doBia] = (await dispararLigacoes(bia)) as [DadosJobLigarLembrete];
    await prisma.assinatura.update({
      where: { usuarioId: bia.usuarioId },
      data: { plano: 'gratuito' },
    });
    expect(await ligacoes.ligar(doBia)).toEqual({ resultado: 'sem_ligacao', motivo: 'plano' });
    expect(pushes(bia)[0]?.corpo).toBe(
      'Lembrete das 08:00. A ligação é dos planos pagos; este lembrete veio por notificação.',
    );
  });
});
