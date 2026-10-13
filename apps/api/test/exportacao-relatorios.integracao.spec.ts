/**
 * Exportação dos relatórios (T-125, RN-151) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`):
 * o pedido grava a exportação e põe o job na fila `relatorios` (falsa aqui), o worker gera o
 * arquivo (chamado direto) e guarda no S3 (em memória), e a consulta devolve a URL de 24 h.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { Exportacao } from '@mony/shared/relatorios';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import {
  ArmazenamentoArquivos,
  ArmazenamentoMemoria,
} from '../src/core/arquivos/armazenamento-arquivos';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { ExportacoesRelatorio } from '../src/modulos/relatorios/exportacoes.service';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: exportação dos relatórios', () => {
  let app: NestFastifyApplication;
  const armazenamento = new ArmazenamentoMemoria();
  const fila = criarFilaFalsa();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo('2026-10-15T15:00:00Z'))
      .overrideProvider(ArmazenamentoArquivos)
      .useValue(armazenamento)
      .overrideProvider(getQueueToken(FILAS.relatorios))
      .useValue(fila)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    fila.add.mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo(plano: 'teste' | 'gratuito' = 'teste') {
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
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    if (plano === 'gratuito') {
      await prisma.assinatura.update({
        where: { usuarioId: sessao.usuario.id },
        data: { plano: 'gratuito', testeInicio: null, testeFim: null },
      });
    }
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: sessao.usuario.id, tipo: 'despesa' },
      orderBy: { nome: 'asc' },
    });
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso, despesa: categoria };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(usuario: Usuario, method: 'GET' | 'POST', url: string, payload?: object) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  async function lancar(usuario: Usuario, valorCentavos: number, data: string) {
    const resposta = await chamar(usuario, 'POST', '/transacoes', {
      tipo: 'despesa',
      descricao: 'Mercado',
      valorCentavos,
      data,
      categoriaId: usuario.despesa.id,
      formaPagamento: 'pix',
    });
    expect(resposta.statusCode).toBe(201);
  }

  const gerar = (id: string) => app.get(ExportacoesRelatorio).gerar(id);

  it('RN-151 PDF: pede, o worker gera e guarda em exportacoes/, e a URL vale 24 horas', async () => {
    const usuario = await usuarioNovo();
    await lancar(usuario, 15_000, '2026-10-10');
    const pedido = await chamar(usuario, 'POST', '/relatorios/exportar', {
      formato: 'pdf',
      inicio: '2026-10-01',
      fim: '2026-10-31',
    });
    expect(pedido.statusCode).toBe(202);
    const exportacao = pedido.json<Exportacao>();
    expect(exportacao).toMatchObject({
      formato: 'pdf',
      inicio: '2026-10-01',
      fim: '2026-10-31',
      status: 'processando',
      url: null,
      expiraEm: null,
    });
    expect(fila.add).toHaveBeenCalledWith(
      'exportar',
      { exportacaoId: exportacao.id },
      expect.objectContaining({ jobId: `exportar-${exportacao.id}`, attempts: 3 }),
    );

    // O mesmo pedido enquanto gera: a mesma exportação.
    const denovo = await chamar(usuario, 'POST', '/relatorios/exportar', {
      formato: 'pdf',
      inicio: '2026-10-01',
      fim: '2026-10-31',
    });
    expect(denovo.json<Exportacao>().id).toBe(exportacao.id);

    await gerar(exportacao.id);
    const pronta = (
      await chamar(usuario, 'GET', `/relatorios/exportacoes/${exportacao.id}`)
    ).json<Exportacao>();
    const chave = `exportacoes/relatorios/${usuario.usuarioId}/${exportacao.id}.pdf`;
    expect(pronta).toMatchObject({
      status: 'pronta',
      url: `https://arquivos.teste/${chave}?leitura&validade=86400&nome=relatorio-2026-10-01-a-2026-10-31.pdf`,
      expiraEm: '2026-10-16T15:00:00.000Z',
    });
    expect(armazenamento.objetos.get(chave)?.tipoConteudo).toBe('application/pdf');
    expect(
      Buffer.from(armazenamento.conteudos.get(chave) ?? [])
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');
    // Gerar de novo não faz nada.
    await gerar(exportacao.id);
  });

  it('RN-151 XLSX: os mesmos números das rotas de relatório; sem período, os últimos 12 meses', async () => {
    const usuario = await usuarioNovo();
    await lancar(usuario, 15_000, '2026-10-10');
    await lancar(usuario, 2_550, '2026-09-20');
    const pedido = (
      await chamar(usuario, 'POST', '/relatorios/exportar', { formato: 'xlsx' })
    ).json<Exportacao>();
    expect(pedido).toMatchObject({ inicio: '2025-11-01', fim: '2026-10-31' });
    await gerar(pedido.id);

    const chave = `exportacoes/relatorios/${usuario.usuarioId}/${pedido.id}.xlsx`;
    expect(armazenamento.objetos.get(chave)?.tipoConteudo).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const arquivos = unzipSync(armazenamento.conteudos.get(chave) ?? new Uint8Array());
    const meses = strFromU8(arquivos['xl/worksheets/sheet1.xml'] ?? new Uint8Array());
    expect(meses).toContain('Ana Souza · 01/11/2025 a 31/10/2026');
    // Linhas 6 a 17: novembro a outubro; setembro é a 16 e outubro a 17.
    expect(meses).toContain('<c r="C16" s="2"><v>25.5</v></c>');
    expect(meses).toContain('<c r="C17" s="2"><v>150</v></c>');
    expect(meses).toContain('<c r="C18" s="3"><v>175.5</v></c>');
    const categorias = strFromU8(arquivos['xl/worksheets/sheet2.xml'] ?? new Uint8Array());
    expect(categorias).toContain(`<t xml:space="preserve">${usuario.despesa.nome}</t>`);
  });

  it('RN-120 RN-151 no gratuito, não exporta', async () => {
    const usuario = await usuarioNovo('gratuito');
    const resposta = await chamar(usuario, 'POST', '/relatorios/exportar', { formato: 'pdf' });
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toEqual({
      erro: {
        codigo: 'LIMITE_PLANO_ATINGIDO',
        mensagem: 'No plano gratuito, os relatórios não são exportados.',
        detalhes: { recurso: 'relatorio', periodo: 'quantidade', limite: 0, renovaEm: null },
      },
    });
    expect(fila.add).not.toHaveBeenCalled();
    expect(
      await prisma.exportacaoRelatorio.count({ where: { usuarioId: usuario.usuarioId } }),
    ).toBe(0);
  });

  it('a exportação de outra pessoa não existe; a que falhou fica com erro', async () => {
    const ana = await usuarioNovo();
    const bia = await usuarioNovo();
    const { id } = (
      await chamar(ana, 'POST', '/relatorios/exportar', { formato: 'pdf' })
    ).json<Exportacao>();
    expect((await chamar(bia, 'GET', `/relatorios/exportacoes/${id}`)).statusCode).toBe(404);

    await app.get(ExportacoesRelatorio).falhar(id);
    expect((await chamar(ana, 'GET', `/relatorios/exportacoes/${id}`)).json()).toMatchObject({
      status: 'erro',
      url: null,
    });
    // Pedir de novo começa outra.
    const outra = (
      await chamar(ana, 'POST', '/relatorios/exportar', { formato: 'pdf' })
    ).json<Exportacao>();
    expect(outra.id).not.toBe(id);
    expect(outra.status).toBe('processando');
  });
});
