/**
 * Usuários no painel (T-141a) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`). Cada teste
 * cria as próprias contas, com um marcador aleatório no nome: os arquivos rodam ao mesmo tempo no
 * mesmo banco.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';
const DIA_MS = 24 * 60 * 60 * 1000;

interface Conta {
  id: string;
  email: string;
  acesso: string;
  renovacao: string;
  aparelho: string;
}

describe.runIf(ativo)('integração: usuários no painel (T-141a)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let tokenAdmin = '';
  let adminId = '';

  const ip = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

  async function cadastrar(nome: string): Promise<Conta> {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const aparelho = `aparelho-${randomUUID()}`;
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: ip(),
      payload: {
        nome,
        email,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: aparelho, plataforma: 'android' },
      },
    });
    const sessao = resposta.json<{
      usuario: { id: string };
      tokens: { acesso: string; renovacao: string };
    }>();
    return {
      id: sessao.usuario.id,
      email,
      acesso: sessao.tokens.acesso,
      renovacao: sessao.tokens.renovacao,
      aparelho,
    };
  }

  const entrar = (conta: Conta) =>
    app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      remoteAddress: ip(),
      payload: {
        email: conta.email,
        senha: 'segredo123',
        dispositivo: { identificador: conta.aparelho, plataforma: 'android' },
      },
    });

  const chamar = (method: 'GET' | 'POST', url: string, token = tokenAdmin, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload }),
    });

  const auditorias = (acao: string, entidadeId?: string) =>
    prisma.registroAuditoria.count({
      where: { usuarioId: adminId, acao, ...(entidadeId ? { entidadeId } : {}) },
    });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const admin = await cadastrar('Ana Admin');
    adminId = admin.id;
    await prisma.usuario.update({ where: { id: adminId }, data: { papel: 'admin' } });
    tokenAdmin = (
      await app.get(TokensAcesso).emitirAdmin(adminId, randomUUID(), Math.floor(Date.now() / 1000))
    ).token;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('busca por parte do nome, pagina pelo cursor e grava a busca na auditoria', async () => {
    const marca = `Marca${randomUUID().slice(0, 8)}`;
    const primeira = await cadastrar(`Bia ${marca}`);
    const segunda = await cadastrar(`Caio ${marca}`);
    const busca = marca.toLowerCase();

    const pagina1 = await chamar('GET', `/v1/admin/usuarios?busca=${busca}&limite=1`);
    expect(pagina1.statusCode).toBe(200);
    const corpo1 = pagina1.json<{
      itens: { id: string; plano: string }[];
      proximoCursor: string;
    }>();
    expect(corpo1.itens.map((item) => item.id)).toEqual([segunda.id]);
    expect(corpo1.itens[0]?.plano).toBe('teste');

    const pagina2 = await chamar(
      'GET',
      `/v1/admin/usuarios?busca=${busca}&limite=1&cursor=${corpo1.proximoCursor}`,
    );
    const corpo2 = pagina2.json<{ itens: { id: string }[]; proximoCursor: string | null }>();
    expect(corpo2.itens.map((item) => item.id)).toEqual([primeira.id]);
    expect(corpo2.proximoCursor).toBeNull();

    const porEmail = await chamar(
      'GET',
      `/v1/admin/usuarios?busca=${primeira.email.toUpperCase()}`,
    );
    expect(porEmail.json<{ itens: { id: string }[] }>().itens.map((item) => item.id)).toEqual([
      primeira.id,
    ]);
    expect(
      await prisma.registroAuditoria.count({
        where: {
          usuarioId: adminId,
          acao: 'usuarios.buscados',
          depois: { path: ['busca'], equals: busca },
        },
      }),
    ).toBe(1);
  });

  it('mostra a conta com aparelho e sessão e grava a visualização', async () => {
    const conta = await cadastrar('Duda Detalhe');
    const resposta = await chamar('GET', `/v1/admin/usuarios/${conta.id}`);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      id: conta.id,
      email: conta.email,
      status: 'ativo',
      plano: 'teste',
      assinatura: { status: 'ativa', clienteStripe: false },
      aparelhos: [{ plataforma: 'android', ativo: true }],
      sessoesAtivas: 1,
      loginsSociais: [],
      conexoes: [],
    });
    expect(await auditorias('usuario.visualizado', conta.id)).toBe(1);
    expect((await chamar('GET', `/v1/admin/usuarios/${randomUUID()}`)).statusCode).toBe(404);
  });

  it('bloquear revoga as sessões e impede o login; reativar libera de novo', async () => {
    const conta = await cadastrar('Edu Bloqueio');
    for (let vez = 0; vez < 2; vez += 1) {
      const bloqueado = await chamar('POST', `/v1/admin/usuarios/${conta.id}/bloquear`);
      expect(bloqueado.statusCode).toBe(200);
      expect(bloqueado.json()).toMatchObject({ status: 'bloqueado', sessoesAtivas: 0 });
    }
    expect(await auditorias('usuario.bloqueado', conta.id)).toBe(1);
    const login = await entrar(conta);
    expect(login.statusCode).toBe(403);
    expect(login.json<{ erro: { codigo: string } }>().erro.codigo).toBe('CONTA_BLOQUEADA');
    const renovar = await app.inject({
      method: 'POST',
      url: '/v1/auth/renovar',
      payload: { renovacao: conta.renovacao },
    });
    expect(renovar.statusCode).toBeGreaterThanOrEqual(400);
    expect(await prisma.transacao.count({ where: { usuarioId: conta.id } })).toBe(0);
    expect(await prisma.usuario.count({ where: { id: conta.id } })).toBe(1);

    const reativado = await chamar('POST', `/v1/admin/usuarios/${conta.id}/reativar`);
    expect(reativado.json()).toMatchObject({ status: 'ativo' });
    expect(await auditorias('usuario.reativado', conta.id)).toBe(1);
    expect((await entrar(conta)).statusCode).toBe(200);
  });

  it('admin não é bloqueado pelo painel', async () => {
    expect((await chamar('POST', `/v1/admin/usuarios/${adminId}/bloquear`)).statusCode).toBe(409);
  });

  it('estende o teste a partir do fim atual; plano pago e dias fora da faixa são recusados', async () => {
    const conta = await cadastrar('Fabi Teste');
    const antes = await prisma.assinatura.findUniqueOrThrow({ where: { usuarioId: conta.id } });
    const estendido = await chamar(
      'POST',
      `/v1/admin/usuarios/${conta.id}/estender-teste`,
      tokenAdmin,
      {
        dias: 2,
      },
    );
    expect(estendido.statusCode).toBe(200);
    const depois = await prisma.assinatura.findUniqueOrThrow({ where: { usuarioId: conta.id } });
    expect(depois.testeFim?.getTime()).toBe((antes.testeFim?.getTime() ?? 0) + 2 * DIA_MS);
    expect(estendido.json<{ assinatura: { testeFim: string } }>().assinatura.testeFim).toBe(
      depois.testeFim?.toISOString(),
    );
    expect(await auditorias('usuario.teste_estendido', conta.id)).toBe(1);

    // Teste vencido (no gratuito): volta ao teste contando de agora.
    await prisma.assinatura.update({
      where: { usuarioId: conta.id },
      data: { plano: 'gratuito', testeFim: new Date(Date.now() - 10 * DIA_MS) },
    });
    const inicio = Date.now();
    const volta = await chamar(
      'POST',
      `/v1/admin/usuarios/${conta.id}/estender-teste`,
      tokenAdmin,
      {
        dias: 1,
      },
    );
    expect(volta.json()).toMatchObject({ plano: 'teste' });
    const novoFim = (await prisma.assinatura.findUniqueOrThrow({ where: { usuarioId: conta.id } }))
      .testeFim;
    expect(novoFim?.getTime()).toBeGreaterThanOrEqual(inicio + DIA_MS);

    for (const dias of [0, 31]) {
      expect(
        (
          await chamar('POST', `/v1/admin/usuarios/${conta.id}/estender-teste`, tokenAdmin, {
            dias,
          })
        ).statusCode,
      ).toBe(400);
    }
    await prisma.assinatura.update({
      where: { usuarioId: conta.id },
      data: { plano: 'mensal', status: 'ativa' },
    });
    expect(
      (
        await chamar('POST', `/v1/admin/usuarios/${conta.id}/estender-teste`, tokenAdmin, {
          dias: 1,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('o token do app não entra', async () => {
    const conta = await cadastrar('Gabi App');
    expect((await chamar('GET', '/v1/admin/usuarios', conta.acesso)).statusCode).toBe(403);
    expect(
      (await chamar('POST', `/v1/admin/usuarios/${conta.id}/bloquear`, conta.acesso)).statusCode,
    ).toBe(403);
  });
});
