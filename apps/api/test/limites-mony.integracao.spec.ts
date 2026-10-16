/**
 * T-151 com Postgres de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`): os limites de custo da
 * Mony por usuário por dia (mensagens e leituras de foto ou PDF), para todos os planos, contados
 * nas mensagens de hoje no fuso do usuário. No limite, a Mony avisa que volta amanhã, sem chamar o
 * modelo e sem gastar a cota do gratuito. Os limites do teste são fixados no Service (o banco é
 * de todos os arquivos de teste).
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { type EventoMony, eventoMonyDoSse, LeitorSse } from '@mony/shared/mony';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { CONFIG_LOCAL, ConfigMonyService } from '../src/modulos/mony/config.service';
import { avisoDoLimiteDiario, LimitesMonyService } from '../src/modulos/mony/limites.service';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: limites diários da Mony', () => {
  let app: NestFastifyApplication;
  let modelo: LlmFake;
  let limites: LimitesMonyService;
  const armazenamento = new ArmazenamentoMemoria();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  const usuarios: string[] = [];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      // 12h em São Paulo: o dia local começou às 03:00 UTC.
      .overrideProvider(Clock)
      .useValue(new ClockFixo('2026-10-15T15:00:00Z'))
      .overrideProvider(ArmazenamentoArquivos)
      .useValue(armazenamento)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    app.get(ConfigMonyService).fixar(CONFIG_LOCAL);
    const provedor = app.get(LlmProvider);
    if (!(provedor instanceof LlmFake)) throw new Error('os testes usam IA_PROVEDOR=fake');
    modelo = provedor;
    limites = app.get(LimitesMonyService);
  });

  beforeEach(() => {
    modelo.limpar();
    vi.spyOn(limites, 'obter').mockResolvedValue({ mensagensPorDia: 2, leiturasPorDia: 1 });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
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
    usuarios.push(sessao.usuario.id);
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  async function enviar(usuario: Usuario, payload: { texto: string } | { arquivoId: string }) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload,
    });
    const eventos = new LeitorSse()
      .ler(resposta.body)
      .map(eventoMonyDoSse)
      .filter((evento): evento is EventoMony => evento !== null);
    return {
      eventos,
      texto: eventos.flatMap((e) => (e.tipo === 'texto.delta' ? [e.texto] : [])).join(''),
      componentes: eventos.flatMap((e) => (e.tipo === 'componente' ? [e.componente] : [])),
    };
  }

  async function foto(usuario: Usuario): Promise<string> {
    const preparo = await app.inject({
      method: 'POST',
      url: '/v1/arquivos',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload: { tipo: 'foto', tipoConteudo: 'image/jpeg', tamanho: 300_000 },
    });
    expect(preparo.statusCode, preparo.body).toBe(201);
    const { id } = preparo.json<{ id: string }>();
    const anexo = await prisma.anexo.findUniqueOrThrow({ where: { id } });
    armazenamento.simularEnvio(anexo.arquivoUrl, 300_000, 'image/jpeg');
    return id;
  }

  /** Mensagens antigas do usuário, gravadas direto no banco com a hora pedida. */
  async function mensagensAntigas(
    usuarioId: string,
    tipo: 'texto' | 'imagem',
    instantes: readonly string[],
  ) {
    const conversa = await prisma.conversa.create({ data: { usuarioId }, select: { id: true } });
    await prisma.mensagem.createMany({
      data: instantes.map((instante) => ({
        usuarioId,
        conversaId: conversa.id,
        autor: 'usuario' as const,
        tipo,
        conteudo: tipo === 'texto' ? 'oi' : null,
        criadoEm: new Date(instante),
      })),
    });
  }

  it('T-151 no limite de mensagens do dia, a Mony avisa que volta amanhã e não chama o modelo', async () => {
    const usuario = await usuarioNovo();
    // Ontem no fuso do usuário (23:59 de 14/10 em São Paulo): não conta.
    await mensagensAntigas(usuario.usuarioId, 'texto', ['2026-10-15T02:59:00Z']);

    modelo.roteirizar({ texto: 'Oi!' }, { texto: 'Oi de novo!' });
    expect((await enviar(usuario, { texto: 'oi' })).texto).toBe('Oi!');
    expect((await enviar(usuario, { texto: 'oi' })).texto).toBe('Oi de novo!');
    expect(modelo.pedidos).toHaveLength(2);

    const recusada = await enviar(usuario, { texto: 'mais uma' });
    expect(recusada.texto).toBe(avisoDoLimiteDiario('mensagem', 2));
    expect(recusada.componentes).toEqual([]);
    expect(recusada.eventos.at(-1)?.tipo).toBe('fim');
    expect(modelo.pedidos).toHaveLength(2);
    // A pergunta e o aviso ficam na conversa, como qualquer mensagem.
    const ultimas = await prisma.mensagem.findMany({
      where: { usuarioId: usuario.usuarioId },
      orderBy: { criadoEm: 'desc' },
      take: 2,
      select: { autor: true, conteudo: true },
    });
    expect(ultimas).toEqual([
      { autor: 'mony', conteudo: avisoDoLimiteDiario('mensagem', 2) },
      { autor: 'usuario', conteudo: 'mais uma' },
    ]);
  });

  it('T-151 o limite de leituras conta só foto e PDF, e vale também no gratuito sem gastar a cota', async () => {
    const usuario = await usuarioNovo();
    await prisma.assinatura.update({
      where: { usuarioId: usuario.usuarioId },
      data: { plano: 'gratuito', testeInicio: null, testeFim: null },
    });
    // Uma leitura hoje, às 09:00 em São Paulo.
    await mensagensAntigas(usuario.usuarioId, 'imagem', ['2026-10-15T12:00:00Z']);

    const recusada = await enviar(usuario, { arquivoId: await foto(usuario) });
    expect(recusada.texto).toBe(avisoDoLimiteDiario('leitura', 1));
    expect(recusada.componentes).toEqual([]);
    expect(modelo.pedidos).toHaveLength(0);
    expect(
      await prisma.usoRecurso.findMany({
        where: { usuarioId: usuario.usuarioId, recurso: 'leitura_documento' },
      }),
    ).toEqual([]);

    // Texto ainda cabe: a cota do gratuito conta a mensagem.
    modelo.roteirizar({ texto: 'Oi!' });
    expect((await enviar(usuario, { texto: 'oi' })).texto).toBe('Oi!');
    expect(
      await prisma.usoRecurso.findMany({
        where: { usuarioId: usuario.usuarioId, recurso: 'mensagem_mony' },
        select: { quantidade: true },
      }),
    ).toEqual([{ quantidade: 1 }]);
  });
});
