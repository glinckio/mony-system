/**
 * Assinaturas no painel (T-141b) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`). Os
 * arquivos rodam ao mesmo tempo no mesmo banco, então os testes conferem as próprias contas nas
 * listas, e não os totais.
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
import { AdminAssinaturasRepository } from '../src/modulos/admin/admin-assinaturas.repository';

const ativo = process.env.TESTES_INTEGRACAO === '1';
const DIA_MS = 24 * 60 * 60 * 1000;

describe.runIf(ativo)('integração: assinaturas no painel (T-141b)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let tokenAdmin = '';

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
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { id: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  const chamar = (url: string, token = tokenAdmin) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const admin = await cadastrar('Ana Admin');
    await prisma.usuario.update({ where: { id: admin.id }, data: { papel: 'admin' } });
    tokenAdmin = (
      await app.get(TokensAcesso).emitirAdmin(admin.id, randomUUID(), Math.floor(Date.now() / 1000))
    ).token;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('cada conta aparece só na lista da sua situação, e a conta excluída em nenhuma', async () => {
    const agora = Date.now();
    const contas = {
      teste: await cadastrar('Teste Valendo'),
      vencido: await cadastrar('Teste Vencido'),
      ativa: await cadastrar('Paga Em Dia'),
      inadimplente: await cadastrar('Paga Atrasada'),
      cancelada: await cadastrar('Paga Cancelada'),
      excluida: await cadastrar('Conta Excluida'),
    };
    const assinatura = (id: string, data: object) =>
      prisma.assinatura.update({ where: { usuarioId: id }, data });
    await assinatura(contas.vencido.id, { testeFim: new Date(agora - DIA_MS) });
    await assinatura(contas.ativa.id, {
      plano: 'mensal',
      status: 'ativa',
      inicio: new Date(agora),
      proximaCobranca: new Date(agora + 30 * DIA_MS),
      cancelamentoAgendado: true,
    });
    await assinatura(contas.inadimplente.id, {
      plano: 'anual',
      status: 'inadimplente',
      inicio: new Date(agora),
    });
    await assinatura(contas.cancelada.id, {
      plano: 'gratuito',
      status: 'cancelada',
      inicio: new Date(agora - 40 * DIA_MS),
      canceladaEm: new Date(agora),
    });
    await prisma.usuario.update({
      where: { id: contas.excluida.id },
      data: { status: 'excluido' },
    });

    const esperado: Record<string, string[]> = {
      teste: [contas.teste.id],
      gratuito: [contas.vencido.id],
      ativa: [contas.ativa.id],
      inadimplente: [contas.inadimplente.id],
      cancelada: [contas.cancelada.id],
    };
    const nossas = new Set(Object.values(contas).map((conta) => conta.id));
    for (const [situacao, ids] of Object.entries(esperado)) {
      const resposta = await chamar(`/v1/admin/assinaturas?situacao=${situacao}&limite=100`);
      expect(resposta.statusCode).toBe(200);
      const itens = resposta
        .json<{ itens: { usuarioId: string; situacao: string }[] }>()
        .itens.filter((item) => nossas.has(item.usuarioId));
      expect(
        itens.map((item) => item.usuarioId),
        situacao,
      ).toEqual(ids);
      expect(itens.every((item) => item.situacao === situacao)).toBe(true);
    }

    const ativas = await chamar('/v1/admin/assinaturas?situacao=ativa&limite=100');
    const paga = ativas
      .json<{ itens: { usuarioId: string; plano: string; cancelamentoAgendado: boolean }[] }>()
      .itens.find((item) => item.usuarioId === contas.ativa.id);
    expect(paga).toMatchObject({ plano: 'mensal', cancelamentoAgendado: true });
  });

  it('pagina pelo cursor', async () => {
    const primeira = await cadastrar('Cursor Um');
    const segunda = await cadastrar('Cursor Dois');
    for (const conta of [primeira, segunda]) {
      await prisma.assinatura.update({
        where: { usuarioId: conta.id },
        data: { plano: 'gratuito', status: 'cancelada', canceladaEm: new Date() },
      });
    }
    // O cursor é o id da última conta da página: a seguinte começa na conta anterior a ela.
    const pagina = await chamar(
      `/v1/admin/assinaturas?situacao=cancelada&limite=1&cursor=${segunda.id}`,
    );
    expect(pagina.statusCode).toBe(200);
    const corpo = pagina.json<{ itens: { usuarioId: string }[]; proximoCursor: string | null }>();
    expect(corpo.itens.map((item) => item.usuarioId)).toEqual([primeira.id]);
  });

  it('conversão do teste: conta os testes que acabaram na janela e os que assinaram', async () => {
    // Uma janela em 2001, que nenhum outro teste usa.
    const inicioJanela = new Date(Date.UTC(2001, 0, 1) + randomInt(1_000_000) * 60_000);
    const fimJanela = new Date(inicioJanela.getTime() + 60_000);
    const [convertida, naoConvertida, foraDaJanela] = [
      await cadastrar('Converteu'),
      await cadastrar('Nao Converteu'),
      await cadastrar('Fora Da Janela'),
    ];
    await prisma.assinatura.update({
      where: { usuarioId: convertida.id },
      data: { testeFim: inicioJanela, plano: 'mensal', inicio: new Date() },
    });
    await prisma.assinatura.update({
      where: { usuarioId: naoConvertida.id },
      data: { testeFim: fimJanela },
    });
    await prisma.assinatura.update({
      where: { usuarioId: foraDaJanela.id },
      data: { testeFim: new Date(fimJanela.getTime() + 1) },
    });

    await expect(
      app.get(AdminAssinaturasRepository).conversaoTeste(inicioJanela, fimJanela),
    ).resolves.toEqual({ encerrados: 2, convertidos: 1 });
  });

  it('o resumo responde com números inteiros e só para admin', async () => {
    const resposta = await chamar('/v1/admin/assinaturas/resumo');
    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<{
      situacoes: Record<string, number>;
      mrrCentavos: number;
      conversaoTeste: { dias: number };
    }>();
    expect(Object.keys(corpo.situacoes).sort()).toEqual([
      'ativa',
      'cancelada',
      'gratuito',
      'inadimplente',
      'teste',
    ]);
    expect(Number.isInteger(corpo.mrrCentavos)).toBe(true);
    expect(corpo.conversaoTeste.dias).toBe(30);

    const pessoa = await cadastrar('Sem Admin');
    expect((await chamar('/v1/admin/assinaturas/resumo', pessoa.acesso)).statusCode).toBe(403);
    expect((await chamar('/v1/admin/assinaturas?situacao=teste', pessoa.acesso)).statusCode).toBe(
      403,
    );
  });
});
