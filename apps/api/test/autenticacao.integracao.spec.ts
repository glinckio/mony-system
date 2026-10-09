/**
 * Fluxos de autenticação com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`).
 * Cada teste usa e-mail e IP próprios, porque o banco e os contadores do Redis são compartilhados.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { TIPOS_ALERTA } from '@mony/shared/enums';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { type Contexto, ContextoAtual } from '../src/core/contexto/contexto';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

@Controller('teste-sessao')
class RotaProtegidaController {
  @Get()
  quemSou(@ContextoAtual() contexto: Contexto): Contexto {
    return contexto;
  }
}

interface RespostaSessao {
  usuario: { id: string; email: string; telefone: string | null };
  tokens: { acesso: string; renovacao: string; acessoExpiraEm: string; renovacaoExpiraEm: string };
  aceitesPendentes: string[];
}

describe.runIf(ativo)('integração: autenticação', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RotaProtegidaController],
    }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** IP aleatório por teste: o limite de 20 por IP (RN-008) é compartilhado no Redis. */
  const novoIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const novoEmail = () => `teste-${randomUUID()}@exemplo.test`;
  const aparelho = (identificador = `aparelho-${randomUUID()}`) => ({
    identificador,
    plataforma: 'android' as const,
    modelo: 'Moto G',
  });

  function cadastrar(email: string, ip = novoIp(), extra: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: ip,
      payload: {
        nome: 'Ana Souza',
        email,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: aparelho(),
        ...extra,
      },
    });
  }

  function entrar(email: string, senha: string, ip: string, dispositivo = aparelho()) {
    return app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      remoteAddress: ip,
      payload: { email, senha, dispositivo },
    });
  }

  function renovar(renovacao: string) {
    return app.inject({ method: 'POST', url: '/v1/auth/renovar', payload: { renovacao } });
  }

  function rotaProtegida(acesso: string) {
    return app.inject({
      method: 'GET',
      url: '/v1/teste-sessao',
      headers: { authorization: `Bearer ${acesso}` },
    });
  }

  async function contaNova(): Promise<{ email: string; sessao: RespostaSessao }> {
    const email = novoEmail();
    const resposta = await cadastrar(email);
    expect(resposta.statusCode).toBe(201);
    return { email, sessao: resposta.json<RespostaSessao>() };
  }

  it('RN-001 RN-006 RN-007 cadastro cria a conta, o teste de 3 dias, os padrões e a sessão', async () => {
    const email = novoEmail();
    const resposta = await cadastrar(`  ${email.toUpperCase()} `.trim());
    expect(resposta.statusCode).toBe(201);
    const sessao = resposta.json<RespostaSessao>();
    expect(sessao.usuario).toMatchObject({ email, telefone: '+5511987654321' });
    expect(sessao.aceitesPendentes).toEqual([]);
    expect((await rotaProtegida(sessao.tokens.acesso)).json()).toMatchObject({
      usuarioId: sessao.usuario.id,
    });

    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: sessao.usuario.id },
      include: {
        assinatura: true,
        aceitesTermos: true,
        sessoes: true,
        dispositivos: true,
        _count: { select: { categorias: true, preferenciasAlerta: true } },
      },
    });
    expect(usuario.senhaHash).toMatch(/^\$argon2id\$/);
    expect(usuario.assinatura?.plano).toBe('teste');
    const { testeInicio, testeFim } = usuario.assinatura ?? {};
    expect((testeFim?.getTime() ?? 0) - (testeInicio?.getTime() ?? 0)).toBe(3 * 24 * 3600 * 1000);
    expect(usuario._count.categorias).toBeGreaterThan(0);
    expect(usuario._count.preferenciasAlerta).toBe(TIPOS_ALERTA.length);
    expect(
      usuario.aceitesTermos
        .map(({ documento, versao }) => ({ documento, versao }))
        .sort((a, b) => a.documento.localeCompare(b.documento)),
    ).toEqual([
      { documento: 'privacidade', versao: VERSOES_DOCUMENTOS.privacidade },
      { documento: 'termos', versao: VERSOES_DOCUMENTOS.termos },
    ]);
    expect(usuario.sessoes).toHaveLength(1);
    expect(usuario.sessoes[0]?.refreshTokenHash).not.toBe(sessao.tokens.renovacao);
    expect(usuario.dispositivos).toHaveLength(1);
  });

  it('RN-001 e-mail já cadastrado, mesmo com outra caixa → 409 EMAIL_JA_CADASTRADO', async () => {
    const { email } = await contaNova();
    const repetido = await cadastrar(email.toUpperCase());
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json()).toMatchObject({ erro: { codigo: 'EMAIL_JA_CADASTRADO' } });
  });

  it('RN-007 aceite de versão antiga dos termos → 403 TERMOS_PENDENTES, sem criar a conta', async () => {
    const email = novoEmail();
    const resposta = await cadastrar(email, novoIp(), {
      aceites: { termos: '2000-01-01', privacidade: VERSOES_DOCUMENTOS.privacidade },
    });
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({
      erro: { codigo: 'TERMOS_PENDENTES', detalhes: { documentos: ['termos'] } },
    });
    expect(await prisma.usuario.count({ where: { email } })).toBe(0);
  });

  it('login: senha certa abre sessão; senha errada e e-mail inexistente dão a mesma resposta', async () => {
    const { email } = await contaNova();
    const ip = novoIp();
    const certo = await entrar(email.toUpperCase(), 'segredo123', ip);
    expect(certo.statusCode).toBe(200);
    expect((await rotaProtegida(certo.json<RespostaSessao>().tokens.acesso)).statusCode).toBe(200);

    const senhaErrada = await entrar(email, 'segredo124', ip);
    const inexistente = await entrar(novoEmail(), 'segredo123', ip);
    for (const resposta of [senhaErrada, inexistente]) {
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toEqual({
        erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'E-mail ou senha incorretos.' },
      });
    }
  });

  it('RN-008 depois de 5 tentativas o e-mail fica bloqueado por 15 minutos, mesmo com a senha certa', async () => {
    const { email } = await contaNova();
    for (let i = 0; i < 5; i += 1) {
      expect((await entrar(email, 'errada-123', novoIp())).statusCode).toBe(401);
    }
    const bloqueado = await entrar(email, 'segredo123', novoIp());
    expect(bloqueado.statusCode).toBe(429);
    const { erro } = bloqueado.json<{
      erro: { codigo: string; detalhes: { tenteNovamenteEm: string } };
    }>();
    expect(erro.codigo).toBe('MUITAS_TENTATIVAS');
    expect(Date.parse(erro.detalhes.tenteNovamenteEm)).toBeGreaterThan(Date.now());
  });

  it('RN-008 um IP faz no máximo 20 tentativas a cada 15 minutos', async () => {
    const ip = novoIp();
    for (let i = 0; i < 20; i += 1) {
      expect((await entrar(novoEmail(), 'qualquer-1', ip)).statusCode).toBe(401);
    }
    expect((await entrar(novoEmail(), 'qualquer-1', ip)).statusCode).toBe(429);
  });

  it('RN-004 renovar gira o token; reusar o antigo derruba todas as sessões do aparelho', async () => {
    const { sessao } = await contaNova();
    const renovada = await renovar(sessao.tokens.renovacao);
    expect(renovada.statusCode).toBe(200);
    const nova = renovada.json<RespostaSessao>();
    expect(nova.tokens.renovacao).not.toBe(sessao.tokens.renovacao);
    expect((await rotaProtegida(nova.tokens.acesso)).statusCode).toBe(200);

    const reuso = await renovar(sessao.tokens.renovacao);
    expect(reuso.statusCode).toBe(401);
    expect(reuso.json()).toMatchObject({ erro: { codigo: 'SESSAO_INVALIDA' } });
    // A família foi revogada: nem o token novo renova mais.
    expect((await renovar(nova.tokens.renovacao)).statusCode).toBe(401);
  });

  it('RN-004 login no mesmo aparelho troca a sessão; o reuso do token trocado só derruba aquele aparelho', async () => {
    const { email } = await contaNova();
    const ip = novoIp();
    const celular = aparelho('celular-da-ana-0001');
    const primeira = (await entrar(email, 'segredo123', ip, celular)).json<RespostaSessao>();
    const tablet = (await entrar(email, 'segredo123', ip, aparelho())).json<RespostaSessao>();
    const segunda = (await entrar(email, 'segredo123', ip, celular)).json<RespostaSessao>();

    // O login novo no celular vale; o token da sessão anterior dele, não.
    const renovada = await renovar(segunda.tokens.renovacao);
    expect(renovada.statusCode).toBe(200);
    expect((await renovar(primeira.tokens.renovacao)).statusCode).toBe(401);
    // Usar o token trocado conta como reuso: o celular sai, o tablet segue.
    expect((await renovar(renovada.json<RespostaSessao>().tokens.renovacao)).statusCode).toBe(401);
    expect((await renovar(tablet.tokens.renovacao)).statusCode).toBe(200);
  });

  it('sair encerra a sessão deste aparelho', async () => {
    const { sessao } = await contaNova();
    const saida = await app.inject({
      method: 'POST',
      url: '/v1/auth/sair',
      payload: { renovacao: sessao.tokens.renovacao },
    });
    expect(saida.statusCode).toBe(204);
    expect((await renovar(sessao.tokens.renovacao)).statusCode).toBe(401);
  });

  it('RN-004 sair de todos os aparelhos encerra todas as sessões do usuário', async () => {
    const { email, sessao } = await contaNova();
    const outra = (await entrar(email, 'segredo123', novoIp())).json<RespostaSessao>();
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/sair-todos',
      headers: { authorization: `Bearer ${sessao.tokens.acesso}` },
    });
    expect(resposta.statusCode).toBe(204);
    expect((await renovar(sessao.tokens.renovacao)).statusCode).toBe(401);
    expect((await renovar(outra.tokens.renovacao)).statusCode).toBe(401);
  });

  it('sessão vencida (60 dias sem uso) não renova', async () => {
    const { sessao } = await contaNova();
    await prisma.sessao.updateMany({
      where: { usuarioId: sessao.usuario.id },
      data: { expiraEm: new Date('2020-01-01T00:00:00Z') },
    });
    const resposta = await renovar(sessao.tokens.renovacao);
    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ erro: { codigo: 'SESSAO_INVALIDA' } });
  });

  it('conta bloqueada não entra nem renova (CONTA_BLOQUEADA)', async () => {
    const { email, sessao } = await contaNova();
    await prisma.usuario.update({
      where: { id: sessao.usuario.id },
      data: { status: 'bloqueado' },
    });
    const login = await entrar(email, 'segredo123', novoIp());
    expect(login.statusCode).toBe(403);
    expect(login.json()).toMatchObject({ erro: { codigo: 'CONTA_BLOQUEADA' } });
    expect((await renovar(sessao.tokens.renovacao)).json()).toMatchObject({
      erro: { codigo: 'CONTA_BLOQUEADA' },
    });
  });
});
