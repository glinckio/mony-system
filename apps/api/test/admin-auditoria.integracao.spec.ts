/**
 * Auditoria no painel (T-141c) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`). Cada teste
 * usa um admin próprio e filtra por ele: os arquivos rodam ao mesmo tempo no mesmo banco.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { dataNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { TokensAcesso } from '../src/core/auth/tokens-acesso';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface Registro {
  id: string;
  admin: { id: string; nome: string } | null;
  acao: string;
  entidadeId: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}

describe.runIf(ativo)('integração: auditoria no painel (T-141c)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  const ip = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

  async function cadastrar(nome: string): Promise<{ id: string; acesso: string }> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: ip(),
      payload: {
        nome,
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    if (resposta.statusCode !== 201) throw new Error(resposta.body);
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { id: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  async function admin(nome: string): Promise<{ id: string; token: string }> {
    const conta = await cadastrar(nome);
    await prisma.usuario.update({ where: { id: conta.id }, data: { papel: 'admin' } });
    const { token } = await app
      .get(TokensAcesso)
      .emitirAdmin(conta.id, randomUUID(), Math.floor(Date.now() / 1000));
    return { id: conta.id, token };
  }

  const chamar = (method: 'GET' | 'POST', url: string, token: string) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('lista as ações de um admin, da mais nova à mais antiga, com filtros e cursor', async () => {
    const ana = await admin('Ana Auditora');
    const pessoa = await cadastrar('Pessoa Auditada');
    await chamar('GET', `/v1/admin/usuarios/${pessoa.id}`, ana.token);
    await chamar('POST', `/v1/admin/usuarios/${pessoa.id}/bloquear`, ana.token);
    await chamar('POST', `/v1/admin/usuarios/${pessoa.id}/reativar`, ana.token);

    const tudo = await chamar('GET', `/v1/admin/auditoria?adminId=${ana.id}`, ana.token);
    expect(tudo.statusCode).toBe(200);
    const registros = tudo.json<{ itens: Registro[] }>().itens;
    expect(registros.map((registro) => registro.acao)).toEqual([
      'usuario.reativado',
      'usuario.bloqueado',
      'usuario.visualizado',
    ]);
    expect(registros[1]).toMatchObject({
      admin: { id: ana.id, nome: 'Ana Auditora' },
      entidadeId: pessoa.id,
      antes: { status: 'ativo' },
      depois: { status: 'bloqueado' },
    });

    const bloqueios = await chamar(
      'GET',
      `/v1/admin/auditoria?adminId=${ana.id}&acao=usuario.bloqueado`,
      ana.token,
    );
    expect(bloqueios.json<{ itens: Registro[] }>().itens.map((r) => r.acao)).toEqual([
      'usuario.bloqueado',
    ]);

    const daPessoa = await chamar(
      'GET',
      `/v1/admin/auditoria?entidade=usuario&entidadeId=${pessoa.id}`,
      ana.token,
    );
    expect(daPessoa.json<{ itens: Registro[] }>().itens).toHaveLength(3);

    const pagina1 = await chamar(
      'GET',
      `/v1/admin/auditoria?adminId=${ana.id}&limite=2`,
      ana.token,
    );
    const corpo1 = pagina1.json<{ itens: Registro[]; proximoCursor: string }>();
    expect(corpo1.itens).toHaveLength(2);
    const pagina2 = await chamar(
      'GET',
      `/v1/admin/auditoria?adminId=${ana.id}&limite=2&cursor=${corpo1.proximoCursor}`,
      ana.token,
    );
    const corpo2 = pagina2.json<{ itens: Registro[]; proximoCursor: string | null }>();
    expect(corpo2.itens.map((r) => r.acao)).toEqual(['usuario.visualizado']);
    expect(corpo2.proximoCursor).toBeNull();
  });

  it('filtra pelo período em dias de São Paulo, os dois inclusos', async () => {
    const bia = await admin('Bia Auditora');
    const pessoa = await cadastrar('Outra Pessoa');
    await chamar('GET', `/v1/admin/usuarios/${pessoa.id}`, bia.token);
    const hoje = dataNoFuso(new Date());
    const ontem = somarDias(hoje, -1);

    const periodo = (de: string, ate: string) =>
      chamar('GET', `/v1/admin/auditoria?adminId=${bia.id}&de=${de}&ate=${ate}`, bia.token).then(
        (resposta) => resposta.json<{ itens: Registro[] }>().itens.length,
      );
    expect(await periodo(hoje, hoje)).toBe(1);
    expect(await periodo(ontem, ontem)).toBe(0);
    expect(await periodo(ontem, hoje)).toBe(1);

    const invertido = await chamar('GET', `/v1/admin/auditoria?de=${hoje}&ate=${ontem}`, bia.token);
    expect(invertido.statusCode).toBe(400);
  });

  it('os filtros trazem os admins, as ações e as entidades do registro; só para admin', async () => {
    const caio = await admin('Caio Auditor');
    const pessoa = await cadastrar('Mais Uma Pessoa');
    await chamar('GET', `/v1/admin/usuarios/${pessoa.id}`, caio.token);

    const filtros = await chamar('GET', '/v1/admin/auditoria/filtros', caio.token);
    expect(filtros.statusCode).toBe(200);
    const corpo = filtros.json<{
      admins: { id: string; nome: string }[];
      acoes: string[];
      entidades: string[];
    }>();
    expect(corpo.admins).toContainEqual({ id: caio.id, nome: 'Caio Auditor' });
    expect(corpo.acoes).toContain('usuario.visualizado');
    expect(corpo.entidades).toContain('usuario');

    expect((await chamar('GET', '/v1/admin/auditoria', pessoa.acesso)).statusCode).toBe(403);
    expect((await chamar('GET', '/v1/admin/auditoria/filtros', pessoa.acesso)).statusCode).toBe(
      403,
    );
  });
});
