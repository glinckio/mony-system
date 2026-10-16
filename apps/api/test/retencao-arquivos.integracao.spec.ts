/**
 * Retenção de fotos e áudios (T-140c, RN-162) com Postgres de verdade (`TESTES_INTEGRACAO=1`): a
 * rotina chamada direto, num instante de 2021, para não tocar nos anexos dos outros testes.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import {
  ArmazenamentoArquivos,
  ArmazenamentoMemoria,
} from '../src/core/arquivos/armazenamento-arquivos';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { RetencaoArquivosService } from '../src/modulos/lgpd/retencao-arquivos.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: retenção de fotos e áudios', () => {
  let app: NestFastifyApplication;
  const armazenamento = new ArmazenamentoMemoria();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ArmazenamentoArquivos)
      .useValue(armazenamento)
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

  async function usuarioNovo(): Promise<string> {
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
    return resposta.json<{ usuario: { id: string } }>().usuario.id;
  }

  async function anexo(
    usuarioId: string,
    tipo: 'foto' | 'audio',
    criadoEm: string,
    transacaoId?: string,
  ) {
    const chave = `usuarios/${usuarioId}/anexos/${randomUUID()}.${tipo === 'foto' ? 'jpg' : 'm4a'}`;
    await armazenamento.gravar(chave, new Uint8Array([1]), 'application/octet-stream');
    const { id } = await prisma.anexo.create({
      data: {
        usuarioId,
        tipo,
        arquivoUrl: chave,
        tamanho: 1,
        criadoEm: new Date(criadoEm),
        ...(transacaoId === undefined ? {} : { transacaoId }),
      },
    });
    return { id, chave };
  }

  it('RN-162 apaga o arquivo e o anexo passados 90 dias; o lançamento fica', async () => {
    const usuarioId = await usuarioNovo();
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId, tipo: 'despesa' },
    });
    const transacao = await prisma.transacao.create({
      data: {
        usuarioId,
        tipo: 'despesa',
        descricao: 'Mercado',
        valor: 15_000n,
        data: new Date('2020-06-01'),
        status: 'pago',
        categoriaId: categoria.id,
      },
    });
    const antigo = await anexo(usuarioId, 'foto', '2020-06-01T12:00:00Z', transacao.id);
    const audio = await anexo(usuarioId, 'audio', '2020-09-01T12:00:00Z');
    const recente = await anexo(usuarioId, 'foto', '2020-12-15T12:00:00Z');

    // 2021-01-01 menos 90 dias = 2020-10-03.
    const { apagados } = await app
      .get(RetencaoArquivosService)
      .limpar(new Date('2021-01-01T12:00:00Z'));

    expect(apagados).toBeGreaterThanOrEqual(2);
    expect(armazenamento.objetos.has(antigo.chave)).toBe(false);
    expect(armazenamento.objetos.has(audio.chave)).toBe(false);
    expect(armazenamento.objetos.has(recente.chave)).toBe(true);
    expect(
      (await prisma.anexo.findMany({ where: { usuarioId }, select: { id: true } })).map(
        ({ id }) => id,
      ),
    ).toEqual([recente.id]);
    expect(await prisma.transacao.findUnique({ where: { id: transacao.id } })).not.toBeNull();
  });
});
