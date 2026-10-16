/**
 * Exportar meus dados (T-140a, RN-160) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`):
 * o pedido grava a exportação e põe o job na fila `privacidade` (falsa aqui), o worker gera o ZIP
 * (chamado direto), guarda no S3 (em memória) e põe o e-mail na fila `emails` (falsa).
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { ExportacaoDados, UltimaExportacaoDados } from '@mony/shared/usuario';
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
import type { MensagemEmail } from '../src/integracoes/email/email.provider';
import { ExportacaoDadosService } from '../src/modulos/lgpd/exportacao-dados.service';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: exportar meus dados', () => {
  let app: NestFastifyApplication;
  const relogio = new ClockFixo('2026-10-16T15:00:00Z');
  const armazenamento = new ArmazenamentoMemoria();
  const fila = criarFilaFalsa();
  const filaEmails = criarFilaFalsa();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(relogio)
      .overrideProvider(ArmazenamentoArquivos)
      .useValue(armazenamento)
      .overrideProvider(getQueueToken(FILAS.privacidade))
      .useValue(fila)
      .overrideProvider(getQueueToken(FILAS.emails))
      .useValue(filaEmails)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    fila.add.mockClear();
    filaEmails.add.mockClear();
    relogio.definir(new Date('2026-10-16T15:00:00Z'));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo() {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso, email };
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

  const gerar = (id: string) => app.get(ExportacaoDadosService).gerar(id);

  it('RN-160 pede, o worker gera o ZIP com JSON e XLSX, manda o e-mail, e a URL vale 24 horas', async () => {
    const ana = await usuarioNovo();
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: ana.usuarioId, tipo: 'despesa' },
    });
    const lancamento = await chamar(ana, 'POST', '/transacoes', {
      tipo: 'despesa',
      descricao: 'Mercado',
      valorCentavos: 15_000,
      data: '2026-10-10',
      categoriaId: categoria.id,
      formaPagamento: 'pix',
    });
    expect(lancamento.statusCode).toBe(201);

    expect((await chamar(ana, 'GET', '/me/exportar')).json()).toEqual({ exportacao: null });
    const pedido = await chamar(ana, 'POST', '/me/exportar');
    expect(pedido.statusCode).toBe(202);
    const exportacao = pedido.json<ExportacaoDados>();
    expect(exportacao).toMatchObject({ status: 'processando', url: null, concluidaEm: null });
    expect(fila.add).toHaveBeenCalledWith(
      'exportar-dados',
      { exportacaoId: exportacao.id },
      expect.objectContaining({ jobId: `exportar-dados-${exportacao.id}`, attempts: 3 }),
    );
    // Pedir de novo enquanto gera: a mesma exportação.
    expect((await chamar(ana, 'POST', '/me/exportar')).json<ExportacaoDados>().id).toBe(
      exportacao.id,
    );

    await gerar(exportacao.id);
    const chave = `exportacoes/dados/${ana.usuarioId}/${exportacao.id}.zip`;
    const url = `https://arquivos.teste/${chave}?leitura&validade=86400&nome=meus-dados-2026-10-16.zip`;
    expect((await chamar(ana, 'GET', '/me/exportar')).json<UltimaExportacaoDados>()).toEqual({
      exportacao: {
        id: exportacao.id,
        status: 'pronta',
        url,
        expiraEm: '2026-10-17T15:00:00.000Z',
        criadoEm: exportacao.criadoEm,
        concluidaEm: '2026-10-16T15:00:00.000Z',
      },
    });
    expect(armazenamento.objetos.get(chave)?.tipoConteudo).toBe('application/zip');

    const arquivos = unzipSync(armazenamento.conteudos.get(chave) ?? new Uint8Array());
    const texto = strFromU8(arquivos['meus-dados.json'] ?? new Uint8Array());
    const json = JSON.parse(texto) as { tabelas: Record<string, Record<string, unknown>[]> };
    expect(json.tabelas.usuarios).toEqual([
      expect.objectContaining({ id: ana.usuarioId, nome: 'Ana Souza', email: ana.email }),
    ]);
    expect(json.tabelas.transacoes).toEqual([
      expect.objectContaining({ descricao: 'Mercado', valor: 15_000 }),
    ]);
    expect(json.tabelas.categorias?.length).toBeGreaterThan(0);
    expect(json.tabelas.aceites_termos?.length).toBeGreaterThan(0);
    expect(json.tabelas.sessoes).toHaveLength(1);
    // Sem hashes, tokens e segredos.
    expect(texto).not.toMatch(/senhaHash|refreshTokenHash|totpSegredo|tokenPush|chaveArquivo/);
    expect(arquivos['meus-dados.xlsx']?.length).toBeGreaterThan(0);

    const [nome, email, opcoes] = filaEmails.add.mock.calls[0] ?? [];
    expect(nome).toBe('exportacao-dados');
    expect(email as MensagemEmail).toMatchObject({ para: { email: ana.email } });
    expect((email as MensagemEmail).texto).toContain(url);
    expect(opcoes).toMatchObject({ jobId: `email-exportacao-dados-${exportacao.id}` });

    // Gerar de novo não faz nada.
    await gerar(exportacao.id);
    expect(filaEmails.add).toHaveBeenCalledTimes(1);

    // No 6º dia o arquivo está para sumir do bucket: a URL não sai mais (pelo serviço, porque o
    // token de acesso já venceu).
    relogio.definir(new Date('2026-10-22T15:00:00Z'));
    expect((await app.get(ExportacaoDadosService).ultima(ana.usuarioId)).exportacao).toMatchObject({
      status: 'pronta',
      url: null,
      expiraEm: null,
    });
  });

  it('RN-160 a exportação de outra pessoa não aparece; a que falhou fica com erro', async () => {
    const ana = await usuarioNovo();
    const bia = await usuarioNovo();
    const { id } = (await chamar(ana, 'POST', '/me/exportar')).json<ExportacaoDados>();
    expect((await chamar(bia, 'GET', '/me/exportar')).json()).toEqual({ exportacao: null });

    await app.get(ExportacaoDadosService).falhar(id);
    expect((await chamar(ana, 'GET', '/me/exportar')).json()).toMatchObject({
      exportacao: { id, status: 'erro', url: null },
    });
    // Pedir de novo começa outra.
    const outra = (await chamar(ana, 'POST', '/me/exportar')).json<ExportacaoDados>();
    expect(outra.id).not.toBe(id);
    expect(outra.status).toBe('processando');
  });
});
