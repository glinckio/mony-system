/**
 * Novidades no app (T-150) com Postgres de verdade (`TESTES_INTEGRACAO=1`). Outros testes também
 * publicam novidades no mesmo banco, então este confere só as dele e os contadores pela diferença.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Novidades } from '@mony/shared/notificacoes';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';
const DIA = 86_400_000;

describe.runIf(ativo)('integração: novidades no app (T-150)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  const usuarios: string[] = [];
  const novidades: string[] = [];

  async function cadastrar(): Promise<{ id: string; acesso: string }> {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Pessoa',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    if (resposta.statusCode !== 201) throw new Error(resposta.body);
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    usuarios.push(sessao.usuario.id);
    return { id: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  async function novidade(dados: {
    titulo: string;
    status?: 'rascunho' | 'publicada' | 'arquivada';
    publicadaEm: Date | null;
    validade?: Date | null;
    videoUrl?: string | null;
  }): Promise<string> {
    const { id } = await prisma.novidade.create({
      data: {
        descricao: 'Texto da novidade',
        status: 'publicada',
        validade: null,
        videoUrl: null,
        ...dados,
      },
      select: { id: true },
    });
    novidades.push(id);
    return id;
  }

  const chamar = (method: 'GET' | 'POST', url: string, token: string) =>
    app.inject({ method, url: `/v1${url}`, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await prisma.novidade.deleteMany({ where: { id: { in: novidades } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('lista só as no ar; as de antes da conta chegam lidas e ler baixa o contador', async () => {
    const agora = Date.now();
    const antiga = await novidade({ titulo: 'Antiga', publicadaEm: new Date(agora - DIA) });
    const pessoa = await cadastrar();
    const { criadoEm } = await prisma.usuario.findUniqueOrThrow({
      where: { id: pessoa.id },
      select: { criadoEm: true },
    });
    const nova = await novidade({
      titulo: 'Nova',
      publicadaEm: new Date(criadoEm.getTime() + 1),
      validade: new Date(agora + DIA),
      videoUrl: 'https://youtu.be/abc123',
    });
    const fora = await Promise.all([
      novidade({ titulo: 'Rascunho', status: 'rascunho', publicadaEm: null }),
      novidade({ titulo: 'Agendada', publicadaEm: new Date(agora + DIA) }),
      novidade({
        titulo: 'Vencida',
        publicadaEm: new Date(agora - 2 * DIA),
        validade: new Date(agora - DIA),
      }),
      novidade({ titulo: 'Desativada', status: 'arquivada', publicadaEm: new Date(agora - DIA) }),
    ]);

    const lista = (await chamar('GET', '/novidades', pessoa.acesso)).json<Novidades>();
    const ids = lista.itens.map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining([nova, antiga]));
    expect(ids.indexOf(nova)).toBeLessThan(ids.indexOf(antiga));
    for (const id of fora) expect(ids).not.toContain(id);
    expect(lista.itens.find(({ id }) => id === nova)).toMatchObject({
      titulo: 'Nova',
      videoUrl: 'https://youtu.be/abc123',
      lida: false,
    });
    expect(lista.itens.find(({ id }) => id === antiga)?.lida).toBe(true);
    expect(lista.naoLidas).toBeGreaterThanOrEqual(1);

    const inicio = (await chamar('GET', '/dashboard', pessoa.acesso)).json<{
      novidadesNaoLidas: number;
    }>();
    expect(inicio.novidadesNaoLidas).toBe(lista.naoLidas);

    const lida = await chamar('POST', `/novidades/${nova}/lida`, pessoa.acesso);
    expect(lida.statusCode).toBe(204);
    expect((await chamar('POST', `/novidades/${nova}/lida`, pessoa.acesso)).statusCode).toBe(204);
    const depois = (await chamar('GET', '/novidades', pessoa.acesso)).json<Novidades>();
    expect(depois.itens.find(({ id }) => id === nova)?.lida).toBe(true);
    expect(
      await prisma.novidadeLeitura.count({ where: { usuarioId: pessoa.id, novidadeId: nova } }),
    ).toBe(1);
  });

  it('a leitura é de cada pessoa, e novidade fora do ar dá 404', async () => {
    const [ana, bia] = [await cadastrar(), await cadastrar()];
    const { criadoEm } = await prisma.usuario.findUniqueOrThrow({
      where: { id: bia.id },
      select: { criadoEm: true },
    });
    const id = await novidade({
      titulo: 'Para as duas',
      publicadaEm: new Date(criadoEm.getTime() + 1),
    });
    expect((await chamar('POST', `/novidades/${id}/lida`, ana.acesso)).statusCode).toBe(204);
    const daBia = (await chamar('GET', '/novidades', bia.acesso)).json<Novidades>();
    expect(daBia.itens.find((item) => item.id === id)?.lida).toBe(false);

    const rascunho = await novidade({ titulo: 'Rascunho', status: 'rascunho', publicadaEm: null });
    expect((await chamar('POST', `/novidades/${rascunho}/lida`, ana.acesso)).statusCode).toBe(404);
    expect((await chamar('POST', `/novidades/${randomUUID()}/lida`, ana.acesso)).statusCode).toBe(
      404,
    );
  });
});
