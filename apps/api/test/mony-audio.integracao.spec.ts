/**
 * Áudio na Mony (T-064), com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`): o app envia o
 * áudio em `POST /arquivos` e manda o `arquivoId` em `POST /mony/mensagens`; a API transcreve
 * (`TRANSCRICAO_PROVEDOR=fake`, com roteiro por teste) e segue como se a pessoa tivesse escrito.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { formatarCentavos } from '@mony/shared/dinheiro';
import {
  type EventoMony,
  eventoMonyDoSse,
  LeitorSse,
  type PaginaConversa,
} from '@mony/shared/mony';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import {
  ArmazenamentoArquivos,
  ArmazenamentoMemoria,
} from '../src/core/arquivos/armazenamento-arquivos';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { LlmFake } from '../src/integracoes/ia/llm-fake';
import { LlmProvider } from '../src/integracoes/ia/llm.provider';
import { TranscricaoFake } from '../src/integracoes/ia/transcricao-fake';
import { ErroTranscricao, TranscricaoProvider } from '../src/integracoes/ia/transcricao.provider';
import {
  MENSAGEM_AUDIO_FALHOU,
  MENSAGEM_AUDIO_VAZIO,
} from '../src/modulos/mony/orquestrador.service';
import { CONFIG_LOCAL, ConfigMonyService } from '../src/modulos/mony/config.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: áudio na Mony', () => {
  let app: NestFastifyApplication;
  let modelo: LlmFake;
  let transcricao: TranscricaoFake;
  const armazenamento = new ArmazenamentoMemoria();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo('2026-10-15T15:00:00Z'))
      .overrideProvider(ArmazenamentoArquivos)
      .useValue(armazenamento)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    // T-068: o prompt do código, mesmo se outro arquivo de teste ativar uma versão no banco.
    app.get(ConfigMonyService).fixar(CONFIG_LOCAL);
    const llm = app.get(LlmProvider);
    const transcritor = app.get(TranscricaoProvider);
    if (!(llm instanceof LlmFake) || !(transcritor instanceof TranscricaoFake)) {
      throw new Error('os testes usam IA_PROVEDOR=fake e TRANSCRICAO_PROVEDOR=fake');
    }
    modelo = llm;
    transcricao = transcritor;
  });

  beforeEach(() => {
    modelo.limpar();
    transcricao.limpar();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo() {
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
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  /** Pede a URL de envio do áudio e, com `enviado`, simula o envio ao S3. */
  async function audio(
    usuario: Usuario,
    { enviado = true, tipo = 'audio', tipoConteudo = 'audio/mp4' } = {},
  ): Promise<string> {
    const preparo = await app.inject({
      method: 'POST',
      url: '/v1/arquivos',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload: { tipo, tipoConteudo, tamanho: 48_000 },
    });
    expect(preparo.statusCode, preparo.body).toBe(201);
    const { id } = preparo.json<{ id: string }>();
    const anexo = await prisma.anexo.findUniqueOrThrow({ where: { id } });
    if (enviado) armazenamento.simularEnvio(anexo.arquivoUrl, 45_000, tipoConteudo);
    return id;
  }

  async function conversar(usuario: Usuario, corpo: object, chave?: string) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      headers: {
        authorization: `Bearer ${usuario.acesso}`,
        ...(chave ? { 'idempotency-key': chave } : {}),
      },
      payload: corpo,
    });
    const eventos = new LeitorSse()
      .ler(resposta.body)
      .map(eventoMonyDoSse)
      .filter((evento): evento is EventoMony => evento !== null);
    return { resposta, eventos };
  }

  const mensagensDo = (usuarioId: string) =>
    prisma.mensagem.findMany({
      where: { usuarioId },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: { id: true, autor: true, tipo: true, conteudo: true, anexoId: true },
    });

  const logsDo = (usuarioId: string) =>
    prisma.logIa.findMany({
      where: { usuarioId },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: { mensagemId: true, modelo: true, ferramenta: true, tokensEntrada: true, erro: true },
    });

  it('o áudio vira texto: evento de transcrição, mensagem com o texto e o fluxo das regras', async () => {
    const usuario = await usuarioNovo();
    const arquivoId = await audio(usuario);
    transcricao.roteirizar({ texto: 'gastei 10', duracaoSegundos: 2 });

    const { resposta, eventos } = await conversar(usuario, { arquivoId });

    expect(resposta.statusCode).toBe(200);
    expect(eventos.map(({ tipo }) => tipo)).toEqual([
      'transcricao',
      'texto.delta',
      'componente',
      'fim',
    ]);
    expect(eventos[0]).toEqual({ tipo: 'transcricao', texto: 'gastei 10' });
    expect(eventos[1]).toEqual({
      tipo: 'texto.delta',
      texto: `Anotei ${formatarCentavos(1_000)}. Em qual categoria?`,
    });
    // A transcrição recebe a URL de leitura assinada do próprio áudio.
    const anexo = await prisma.anexo.findUniqueOrThrow({ where: { id: arquivoId } });
    expect(transcricao.pedidos).toHaveLength(1);
    expect(transcricao.pedidos[0]?.url).toContain(`${anexo.arquivoUrl}?leitura`);
    expect(transcricao.pedidos[0]?.tipoConteudo).toBe('audio/mp4');
    expect(modelo.pedidos).toEqual([]);

    const [pergunta, respostaMony] = await mensagensDo(usuario.usuarioId);
    expect(pergunta).toMatchObject({
      autor: 'usuario',
      tipo: 'audio',
      conteudo: 'gastei 10',
      anexoId: arquivoId,
    });
    expect(respostaMony).toMatchObject({ autor: 'mony', anexoId: null });
    expect(await logsDo(usuario.usuarioId)).toEqual([
      {
        mensagemId: pergunta?.id,
        modelo: 'fake',
        ferramenta: 'transcricao',
        tokensEntrada: 0,
        erro: null,
      },
    ]);

    // No histórico, a mensagem de voz aparece com o texto entendido.
    const pagina = await app.inject({
      method: 'GET',
      url: '/v1/mony/conversa',
      headers: { authorization: `Bearer ${usuario.acesso}` },
    });
    expect(pagina.json<PaginaConversa>().itens.at(-1)).toMatchObject({
      autor: 'usuario',
      tipo: 'audio',
      conteudo: 'gastei 10',
    });

    // O mesmo áudio não vale para outra mensagem.
    const repetido = await conversar(usuario, { arquivoId });
    expect(repetido.eventos).toEqual([
      { tipo: 'erro', codigo: 'CONFLITO', mensagem: 'Este arquivo já foi enviado.' },
    ]);
    expect(await mensagensDo(usuario.usuarioId)).toHaveLength(2);
  });

  it('quando as regras não respondem, o texto do áudio vai ao modelo', async () => {
    const usuario = await usuarioNovo();
    const arquivoId = await audio(usuario);
    transcricao.roteirizar({ texto: 'Quanto eu gastei esse mês?', duracaoSegundos: 3 });
    modelo.roteirizar({ texto: 'Até agora, nada neste mês.' });

    const { eventos } = await conversar(usuario, { arquivoId });

    expect(eventos[0]).toEqual({ tipo: 'transcricao', texto: 'Quanto eu gastei esse mês?' });
    expect(eventos.at(-1)?.tipo).toBe('fim');
    expect(modelo.pedidos).toHaveLength(1);
    expect(modelo.pedidos[0]?.mensagens.at(-1)).toEqual({
      papel: 'usuario',
      conteudo: 'Quanto eu gastei esse mês?',
    });
    expect((await logsDo(usuario.usuarioId)).map(({ ferramenta }) => ferramenta)).toEqual([
      'transcricao',
      null,
    ]);
  });

  it('RN-092 áudio de outra pessoa ou que não chegou ao S3 não vira mensagem', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();

    const deOutro = await conversar(usuario, { arquivoId: await audio(outro) });
    expect(deOutro.resposta.statusCode).toBe(200);
    expect(deOutro.eventos).toEqual([
      { tipo: 'erro', codigo: 'NAO_ENCONTRADO', mensagem: expect.any(String) as string },
    ]);

    const naoEnviado = await audio(usuario, { enviado: false });
    expect((await conversar(usuario, { arquivoId: naoEnviado })).eventos).toEqual([
      {
        tipo: 'erro',
        codigo: 'REQUISICAO_INVALIDA',
        mensagem: 'O arquivo ainda não terminou de ser enviado.',
      },
    ]);

    expect(await mensagensDo(usuario.usuarioId)).toEqual([]);
    expect(transcricao.pedidos).toEqual([]);
  });

  it('o corpo traz o texto ou o áudio; áudio não é anexo de lançamento nem aceita outro conteúdo', async () => {
    const usuario = await usuarioNovo();
    const arquivoId = await audio(usuario);

    for (const corpo of [{}, { texto: 'oi', arquivoId }, { arquivoId: 'audio.m4a' }]) {
      const { resposta } = await conversar(usuario, corpo);
      expect(resposta.statusCode, JSON.stringify(corpo)).toBe(400);
    }

    const errado = await app.inject({
      method: 'POST',
      url: '/v1/arquivos',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload: { tipo: 'audio', tipoConteudo: 'image/png', tamanho: 1000 },
    });
    expect(errado.statusCode).toBe(400);

    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId, tipo: 'despesa' },
    });
    const despesa = await app.inject({
      method: 'POST',
      url: '/v1/transacoes',
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      payload: {
        tipo: 'despesa',
        descricao: 'Mercado',
        valorCentavos: 1_000,
        data: '2026-10-15',
        status: 'pago',
        formaPagamento: 'pix',
        categoriaId: categoria.id,
        anexoIds: [arquivoId],
      },
    });
    expect(despesa.statusCode, despesa.body).toBe(400);
    expect(despesa.json<{ erro: { mensagem: string } }>().erro.mensagem).toBe(
      'Áudio não vai como anexo de lançamento.',
    );
  });

  it('transcrição que falha avisa e, com a mesma chave, tenta de novo; áudio sem fala avisa', async () => {
    const usuario = await usuarioNovo();
    const arquivoId = await audio(usuario);
    const chave = randomUUID();
    transcricao.roteirizar({ erro: new ErroTranscricao('A Deepgram respondeu 503', true) });

    const falha = await conversar(usuario, { arquivoId }, chave);
    expect(falha.eventos.map(({ tipo }) => tipo)).toEqual(['erro', 'fim']);
    expect(falha.eventos[0]).toEqual({
      tipo: 'erro',
      codigo: 'SERVICO_INDISPONIVEL',
      mensagem: MENSAGEM_AUDIO_FALHOU,
    });
    expect(await mensagensDo(usuario.usuarioId)).toMatchObject([
      { autor: 'usuario', tipo: 'audio', conteudo: null, anexoId: arquivoId },
      { autor: 'mony', conteudo: MENSAGEM_AUDIO_FALHOU },
    ]);
    expect(await logsDo(usuario.usuarioId)).toMatchObject([
      { ferramenta: 'transcricao', erro: 'A Deepgram respondeu 503' },
    ]);

    // O reenvio com a mesma chave usa a mesma mensagem e transcreve de novo.
    transcricao.roteirizar({ texto: 'gastei 10', duracaoSegundos: 2 });
    const denovo = await conversar(usuario, { arquivoId }, chave);
    expect(denovo.eventos[0]).toEqual({ tipo: 'transcricao', texto: 'gastei 10' });
    expect(denovo.eventos.at(-1)?.tipo).toBe('fim');
    const mensagens = await mensagensDo(usuario.usuarioId);
    expect(mensagens.filter(({ autor }) => autor === 'usuario')).toMatchObject([
      { tipo: 'audio', conteudo: 'gastei 10', anexoId: arquivoId },
    ]);

    // Sem fala: nada a fazer, a Mony pede para repetir.
    const mudo = await audio(usuario);
    transcricao.roteirizar({ texto: '', duracaoSegundos: 4 });
    const vazio = await conversar(usuario, { arquivoId: mudo });
    expect(vazio.eventos.map(({ tipo }) => tipo)).toEqual(['erro', 'fim']);
    expect(vazio.eventos[0]).toEqual({
      tipo: 'erro',
      codigo: 'REQUISICAO_INVALIDA',
      mensagem: MENSAGEM_AUDIO_VAZIO,
    });
    expect(modelo.pedidos).toEqual([]);
  });
});
