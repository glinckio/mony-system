/**
 * Mony da PoC T-020 com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`): o SSE
 * de `POST /mony/mensagens` e o fluxo "gastei 10" com botões até gravar a despesa. O modelo é o
 * falso (`IA_PROVEDOR=fake`).
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
  type OpcaoBotao,
  type RespostaAcaoMony,
} from '@mony/shared/mony';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { RESPOSTA_FAKE } from '../src/integracoes/ia/llm-fake';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: Mony (PoC T-020)', () => {
  let app: NestFastifyApplication;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo('2026-10-15T15:00:00Z'))
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

  async function conversar(usuario: Usuario, texto: string) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload: { texto },
    });
    const leitor = new LeitorSse();
    const eventos = leitor
      .ler(resposta.body)
      .map(eventoMonyDoSse)
      .filter((evento): evento is EventoMony => evento !== null);
    return { resposta, eventos };
  }

  async function tocar(usuario: Usuario, opcao: OpcaoBotao, chave = randomUUID()) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/mony/acoes',
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': chave },
      payload: { acao: opcao.acao },
    });
    return resposta;
  }

  function botoes(evento: EventoMony | RespostaAcaoMony['componente'] | undefined): OpcaoBotao[] {
    if (!evento) return [];
    const componente =
      'tipo' in evento && evento.tipo === 'componente' ? evento.componente : evento;
    return 'opcoes' in componente ? componente.opcoes : [];
  }

  it('"gastei 10": texto, botões de categoria (a mais usada primeiro), forma de pagamento e a despesa gravada', async () => {
    const usuario = await usuarioNovo();
    const categorias = await prisma.categoria.findMany({
      where: { usuarioId: usuario.usuarioId, tipo: 'despesa' },
      orderBy: { nome: 'asc' },
    });
    const preferida = categorias.at(-1);
    if (!preferida) throw new Error('usuário sem categoria de despesa');
    await prisma.transacao.createMany({
      data: [1, 2].map((dia) => ({
        usuarioId: usuario.usuarioId,
        tipo: 'despesa' as const,
        descricao: 'Antes',
        valor: 1_000n,
        data: new Date(`2026-10-0${String(dia)}T00:00:00Z`),
        status: 'pago' as const,
        formaPagamento: 'pix' as const,
        categoriaId: preferida.id,
      })),
    });

    const { resposta, eventos } = await conversar(usuario, 'gastei 10 no mercado');
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(resposta.headers['x-request-id']).toBeTruthy();
    expect(eventos.map(({ tipo }) => tipo)).toEqual(['texto.delta', 'componente', 'fim']);
    expect(eventos[0]).toEqual({
      tipo: 'texto.delta',
      texto: `Anotei ${formatarCentavos(1_000)}. Em qual categoria?`,
    });
    const deCategoria = botoes(eventos[1]);
    expect(deCategoria).toHaveLength(4);
    expect(deCategoria[0]?.rotulo).toBe(preferida.nome);

    const escolha = deCategoria[0];
    if (!escolha) throw new Error('sem botão');
    const forma = await tocar(usuario, escolha);
    expect(forma.statusCode, forma.body).toBe(200);
    const comoPagou = forma.json<RespostaAcaoMony>();
    expect(comoPagou.texto).toBe('Como você pagou?');
    expect(botoes(comoPagou.componente).map(({ rotulo }) => rotulo)).toEqual([
      'Pix',
      'Débito',
      'Dinheiro',
    ]);

    const pix = botoes(comoPagou.componente)[0];
    if (!pix) throw new Error('sem botão');
    const chave = randomUUID();
    const fim = (await tocar(usuario, pix, chave)).json<RespostaAcaoMony>();
    expect(fim.texto).toBe(
      `Pronto! Anotei ${formatarCentavos(1_000)} em ${preferida.nome}, no Pix.`,
    );
    // O mesmo toque repetido (rede ruim) não grava de novo.
    expect((await tocar(usuario, pix, chave)).json<RespostaAcaoMony>()).toEqual(fim);
    const gravadas = await prisma.transacao.findMany({
      where: { usuarioId: usuario.usuarioId, origem: 'mony' },
      select: {
        id: true,
        valor: true,
        categoriaId: true,
        formaPagamento: true,
        status: true,
        data: true,
      },
    });
    expect(gravadas).toEqual([
      {
        id: fim.transacaoId,
        valor: 1_000n,
        categoriaId: preferida.id,
        formaPagamento: 'pix',
        status: 'pago',
        data: new Date('2026-10-15T00:00:00Z'),
      },
    ]);
  });

  it('mensagem que não é gasto vai para o modelo, em pedaços', async () => {
    const usuario = await usuarioNovo();
    const { eventos } = await conversar(usuario, 'oi, Mony');
    const pedacos = eventos.flatMap((evento) =>
      evento.tipo === 'texto.delta' ? [evento.texto] : [],
    );
    expect(pedacos.length).toBeGreaterThan(1);
    expect(pedacos.join('')).toBe(RESPOSTA_FAKE);
    expect(eventos.at(-1)?.tipo).toBe('fim');
  });

  it('sem login, texto vazio ou categoria de outro usuário: erro em JSON, sem SSE', async () => {
    const usuario = await usuarioNovo();
    const semLogin = await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      payload: { texto: 'gastei 10' },
    });
    expect(semLogin.statusCode).toBe(401);
    expect(semLogin.headers['content-type']).toContain('application/json');

    const vazio = await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload: { texto: '   ' },
    });
    expect(vazio.statusCode).toBe(400);

    const outro = await usuarioNovo();
    const { eventos } = await conversar(outro, 'gastei 25');
    const alheio = botoes(eventos[1])[0];
    if (!alheio) throw new Error('sem botão');
    expect((await tocar(usuario, alheio)).statusCode).toBe(404);
  });
});
