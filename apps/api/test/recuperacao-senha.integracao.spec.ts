/**
 * Recuperação de senha com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`).
 * O código sai do job que a API pôs na fila `emails`, como o worker o receberia.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { FILAS, idDeJob } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import type { MensagemEmail } from '../src/integracoes/email/email.provider';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface RespostaSessao {
  usuario: { id: string; email: string };
  tokens: { acesso: string; renovacao: string };
}

describe.runIf(ativo)('integração: recuperação de senha', () => {
  let app: NestFastifyApplication;
  let filaEmails: Queue<MensagemEmail>;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    filaEmails = app.get<Queue<MensagemEmail>>(getQueueToken(FILAS.emails));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** IP aleatório por chamada: o limite por IP (RN-008) é compartilhado no Redis. */
  const novoIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const aparelho = () => ({
    identificador: `aparelho-${randomUUID()}`,
    plataforma: 'ios' as const,
  });

  function post(url: string, payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: `/v1/auth/${url}`, remoteAddress: novoIp(), payload });
  }

  async function contaNova(): Promise<{ email: string; sessao: RespostaSessao }> {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const resposta = await post('cadastro', {
      nome: 'Ana Souza',
      email,
      telefone: '(11) 98765-4321',
      senha: 'senha-antiga',
      aceites: { ...VERSOES_DOCUMENTOS },
      dispositivo: aparelho(),
    });
    expect(resposta.statusCode).toBe(201);
    return { email, sessao: resposta.json<RespostaSessao>() };
  }

  /** Pede o código e devolve o que foi para a fila `emails`. */
  async function pedirCodigo(email: string, usuarioId: string) {
    const resposta = await post('senha/codigo', { email });
    expect(resposta.statusCode).toBe(202);
    const ultimo = await prisma.codigoRecuperacao.findFirstOrThrow({
      where: { usuarioId },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
    });
    const job = await filaEmails.getJob(idDeJob('codigo-recuperacao', ultimo.id));
    const codigo = /\b(\d{6})\b/.exec(job?.data.texto ?? '')?.[1] ?? '';
    expect(codigo).toMatch(/^\d{6}$/);
    return { codigo, registro: ultimo, mensagem: job?.data };
  }

  const redefinir = (email: string, codigo: string, senha = 'senha-nova-1') =>
    post('senha/redefinir', { email, codigo, senha, dispositivo: aparelho() });

  it('RN-003 código por e-mail, conferência e senha nova; sessões antigas caem', async () => {
    const { email, sessao } = await contaNova();
    const { codigo, registro, mensagem } = await pedirCodigo(
      email.toUpperCase(),
      sessao.usuario.id,
    );

    expect(mensagem).toMatchObject({ para: { email }, modelo: 'codigo-recuperacao' });
    expect(registro.codigoHash).toMatch(/^\$argon2id\$/);
    expect(registro.codigoHash).not.toContain(codigo);
    expect(registro.expiraEm.getTime() - registro.criadoEm.getTime()).toBeGreaterThan(14 * 60_000);
    expect(registro.expiraEm.getTime() - registro.criadoEm.getTime()).toBeLessThanOrEqual(
      15 * 60_000 + 1000,
    );

    expect((await post('senha/conferir', { email, codigo })).statusCode).toBe(204);
    const redefinida = await redefinir(email, codigo);
    expect(redefinida.statusCode).toBe(200);
    expect(redefinida.json<RespostaSessao>().usuario.id).toBe(sessao.usuario.id);

    const login = (senha: string) => post('login', { email, senha, dispositivo: aparelho() });
    expect((await login('senha-nova-1')).statusCode).toBe(200);
    expect((await login('senha-antiga')).statusCode).toBe(401);
    expect((await post('renovar', { renovacao: sessao.tokens.renovacao })).statusCode).toBe(401);

    // Uso único.
    const repetido = await redefinir(email, codigo, 'outra-senha-1');
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json()).toMatchObject({ erro: { codigo: 'CODIGO_EXPIRADO' } });
  });

  it('e-mail sem conta recebe a mesma resposta e nada vai para a fila', async () => {
    const antes = await filaEmails.getJobCounts('waiting');
    const resposta = await post('senha/codigo', { email: `ninguem-${randomUUID()}@exemplo.test` });
    expect(resposta.statusCode).toBe(202);
    expect(resposta.body).toBe('');
    expect(await filaEmails.getJobCounts('waiting')).toEqual(antes);

    const conferencia = await post('senha/conferir', {
      email: `ninguem-${randomUUID()}@exemplo.test`,
      codigo: '123456',
    });
    expect(conferencia.statusCode).toBe(400);
    expect(conferencia.json()).toMatchObject({ erro: { codigo: 'CODIGO_INVALIDO' } });
  });

  it('RN-003 pedir um código novo invalida o anterior', async () => {
    const { email, sessao } = await contaNova();
    const primeiro = await pedirCodigo(email, sessao.usuario.id);
    const segundo = await pedirCodigo(email, sessao.usuario.id);

    // Só o último código vale (a chance de os dois serem iguais é de uma em um milhão).
    expect((await redefinir(email, primeiro.codigo)).json()).toMatchObject({
      erro: { codigo: 'CODIGO_INVALIDO' },
    });
    expect((await redefinir(email, segundo.codigo)).statusCode).toBe(200);
  });

  it('RN-003 código errado conta tentativa; com 5 erros o código deixa de valer', async () => {
    const { email, sessao } = await contaNova();
    const { codigo, registro } = await pedirCodigo(email, sessao.usuario.id);
    const errado = codigo === '000000' ? '111111' : '000000';

    const resposta = await post('senha/conferir', { email, codigo: errado });
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'CODIGO_INVALIDO' } });
    expect(
      (await prisma.codigoRecuperacao.findUniqueOrThrow({ where: { id: registro.id } })).tentativas,
    ).toBe(1);

    // As outras quatro já esbarram no limite por e-mail (RN-008); aqui o código chega a 5 direto.
    await prisma.codigoRecuperacao.update({ where: { id: registro.id }, data: { tentativas: 5 } });
    const esgotado = await post('senha/conferir', { email, codigo });
    expect(esgotado.json()).toMatchObject({ erro: { codigo: 'CODIGO_EXPIRADO' } });
  });

  it('RN-003 código vencido (15 minutos) não vale', async () => {
    const { email, sessao } = await contaNova();
    const { codigo, registro } = await pedirCodigo(email, sessao.usuario.id);
    await prisma.codigoRecuperacao.update({
      where: { id: registro.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });
    expect((await post('senha/conferir', { email, codigo })).json()).toMatchObject({
      erro: { codigo: 'CODIGO_EXPIRADO' },
    });
  });

  it('RN-008 5 conferências por e-mail a cada 15 minutos; o código certo zera a contagem', async () => {
    const { email, sessao } = await contaNova();
    const { codigo } = await pedirCodigo(email, sessao.usuario.id);
    const errado = codigo === '000000' ? '111111' : '000000';

    for (let i = 0; i < 4; i += 1) {
      expect((await post('senha/conferir', { email, codigo: errado })).statusCode).toBe(400);
    }
    expect((await post('senha/conferir', { email, codigo })).statusCode).toBe(204);
    // A contagem recomeçou: mais 5 chamadas passam (o código esgota as tentativas no caminho).
    for (let i = 0; i < 5; i += 1) {
      expect((await post('senha/conferir', { email, codigo: errado })).statusCode).toBe(400);
    }
    const bloqueado = await post('senha/conferir', { email, codigo });
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json()).toMatchObject({ erro: { codigo: 'MUITAS_TENTATIVAS' } });
  });

  it('RN-008 no máximo 5 pedidos de código por e-mail a cada 15 minutos', async () => {
    const { email } = await contaNova();
    for (let i = 0; i < 5; i += 1) {
      expect((await post('senha/codigo', { email })).statusCode).toBe(202);
    }
    expect((await post('senha/codigo', { email })).statusCode).toBe(429);
  });

  it('redefinir a senha libera o login de quem tinha esgotado as tentativas', async () => {
    const { email, sessao } = await contaNova();
    const login = (senha: string) => post('login', { email, senha, dispositivo: aparelho() });
    for (let i = 0; i < 5; i += 1) expect((await login('chute-errado')).statusCode).toBe(401);
    expect((await login('senha-antiga')).statusCode).toBe(429);

    const { codigo } = await pedirCodigo(email, sessao.usuario.id);
    expect((await redefinir(email, codigo)).statusCode).toBe(200);
    expect((await login('senha-nova-1')).statusCode).toBe(200);
  });

  it('conta bloqueada não recebe código', async () => {
    const { email, sessao } = await contaNova();
    await prisma.usuario.update({
      where: { id: sessao.usuario.id },
      data: { status: 'bloqueado' },
    });
    expect((await post('senha/codigo', { email })).statusCode).toBe(202);
    expect(await prisma.codigoRecuperacao.count({ where: { usuarioId: sessao.usuario.id } })).toBe(
      0,
    );
  });
});
