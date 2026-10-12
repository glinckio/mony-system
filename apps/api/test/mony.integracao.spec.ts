/**
 * Mony com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`): o SSE de
 * `POST /mony/mensagens`, o fluxo "gastei 10" com botões (PoC T-020) e o orquestrador da T-060:
 * contexto, histórico, ferramentas, retentativas, `logs_ia` e `GET /mony/conversa`. O modelo é o
 * falso (`IA_PROVEDOR=fake`), com roteiro por teste.
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
  type PaginaConversa,
  type RespostaAcaoMony,
} from '@mony/shared/mony';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { LlmFake, RESPOSTA_FAKE } from '../src/integracoes/ia/llm-fake';
import { type BlocoLlm, ErroLlm, LlmProvider } from '../src/integracoes/ia/llm.provider';
import { MENSAGEM_FALHA } from '../src/modulos/mony/orquestrador.service';
import { PROMPT_SISTEMA } from '../src/modulos/mony/prompts/sistema';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: Mony', () => {
  let app: NestFastifyApplication;
  let modelo: LlmFake;
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
    const provedor = app.get(LlmProvider);
    if (!(provedor instanceof LlmFake)) throw new Error('os testes usam IA_PROVEDOR=fake');
    modelo = provedor;
  });

  beforeEach(() => {
    modelo.limpar();
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

  async function conversar(usuario: Usuario, texto: string, chave?: string) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      headers: {
        authorization: `Bearer ${usuario.acesso}`,
        ...(chave ? { 'idempotency-key': chave } : {}),
      },
      payload: { texto },
    });
    const leitor = new LeitorSse();
    const eventos = leitor
      .ler(resposta.body)
      .map(eventoMonyDoSse)
      .filter((evento): evento is EventoMony => evento !== null);
    const pedacos = eventos.flatMap((evento) =>
      evento.tipo === 'texto.delta' ? [evento.texto] : [],
    );
    const fim = eventos.at(-1);
    return {
      resposta,
      eventos,
      texto: pedacos.join(''),
      mensagemId: fim?.tipo === 'fim' ? fim.mensagemId : null,
    };
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

  async function historico(usuario: Usuario, consulta = '') {
    const resposta = await app.inject({
      method: 'GET',
      url: `/v1/mony/conversa${consulta}`,
      headers: { authorization: `Bearer ${usuario.acesso}` },
    });
    return resposta;
  }

  const mensagensDo = (usuarioId: string) =>
    prisma.mensagem.findMany({
      where: { usuarioId },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: { id: true, autor: true, tipo: true, conteudo: true, idempotencyKey: true },
    });

  const logsDo = (usuarioId: string) =>
    prisma.logIa.findMany({
      where: { usuarioId },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: {
        mensagemId: true,
        modelo: true,
        tokensEntrada: true,
        tokensSaida: true,
        ferramenta: true,
        erro: true,
      },
    });

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
    // A regra resolve sem o modelo.
    expect(modelo.pedidos).toEqual([]);

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

    // Tudo no histórico: mensagem, toques (tipo botao) e respostas, sem duplicar o toque repetido.
    const pagina = (await historico(usuario)).json<PaginaConversa>();
    expect(
      pagina.itens.map(({ autor, tipo, conteudo, componentes }) => [
        autor,
        tipo,
        conteudo,
        componentes.length,
      ]),
    ).toEqual([
      ['mony', 'texto', fim.texto, 0],
      ['usuario', 'botao', 'Pix', 0],
      ['mony', 'texto', 'Como você pagou?', 1],
      ['usuario', 'botao', preferida.nome, 0],
      ['mony', 'texto', `Anotei ${formatarCentavos(1_000)}. Em qual categoria?`, 1],
      ['usuario', 'texto', 'gastei 10 no mercado', 0],
    ]);
    expect(pagina.itens[4]?.componentes[0]).toEqual(
      eventos[1]?.tipo === 'componente' && eventos[1].componente,
    );
  });

  it('mensagem que não é gasto vai ao modelo com prompt, contexto do usuário e ferramentas; grava a resposta e o logs_ia', async () => {
    const usuario = await usuarioNovo();
    const { eventos, texto, mensagemId } = await conversar(usuario, 'oi, Mony');
    expect(eventos.filter(({ tipo }) => tipo === 'texto.delta').length).toBeGreaterThan(1);
    expect(texto).toBe(RESPOSTA_FAKE);
    expect(eventos.at(-1)?.tipo).toBe('fim');

    const [pedido] = modelo.pedidos;
    expect(pedido?.sistema[0]).toBe(PROMPT_SISTEMA);
    const contextoUsuario = pedido?.sistema[1] ?? '';
    expect(contextoUsuario).toContain('Hoje: quinta-feira, 15/10/2026, no fuso America/Sao_Paulo.');
    expect(contextoUsuario).toContain('- Nome: Ana.');
    expect(contextoUsuario).toMatch(/Categorias de despesa: .*Alimentação/);
    expect(contextoUsuario).toContain('- Cartões: nenhum cadastrado.');
    expect(contextoUsuario).toContain('- Orçamentos de outubro/2026: nenhum.');
    // Dados sensíveis não vão ao modelo (doc 08).
    expect(contextoUsuario).not.toContain(usuario.email);
    expect(contextoUsuario).not.toContain('98765');
    expect(pedido?.mensagens).toEqual([{ papel: 'usuario', conteudo: 'oi, Mony' }]);
    expect(pedido?.ferramentas?.map(({ nome }) => nome)).toEqual(['listar_categorias']);

    const mensagens = await mensagensDo(usuario.usuarioId);
    expect(mensagens.map(({ autor, conteudo }) => [autor, conteudo])).toEqual([
      ['usuario', 'oi, Mony'],
      ['mony', RESPOSTA_FAKE],
    ]);
    expect(mensagemId).toBe(mensagens[1]?.id);
    const logs = await logsDo(usuario.usuarioId);
    expect(logs).toEqual([
      {
        mensagemId: mensagens[0]?.id,
        modelo: 'fake',
        tokensEntrada: expect.any(Number) as number,
        tokensSaida: Math.ceil((RESPOSTA_FAKE.length + 2) / 4),
        ferramenta: null,
        erro: null,
      },
    ]);
    expect(logs[0]?.tokensEntrada).toBeGreaterThan(0);

    // A próxima mensagem leva o histórico.
    modelo.roteirizar({ texto: 'Tudo certo!' });
    await conversar(usuario, 'tudo bem?');
    expect(modelo.pedidos[1]?.mensagens).toEqual([
      { papel: 'usuario', conteudo: 'oi, Mony' },
      { papel: 'assistente', conteudo: RESPOSTA_FAKE },
      { papel: 'usuario', conteudo: 'tudo bem?' },
    ]);
  });

  it('RN-092 ferramentas: o modelo pede, a API executa com o usuário da conversa e devolve o resultado', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    await prisma.categoria.updateMany({
      where: { usuarioId: outro.usuarioId, tipo: 'receita' },
      data: { nome: 'Receita do outro' },
    });
    modelo.roteirizar(
      {
        texto: 'Vou olhar.',
        ferramentas: [
          { nome: 'listar_categorias', entrada: { tipo: 'receita', usuarioId: outro.usuarioId } },
          { nome: 'listar_categorias', entrada: { tipo: 'investimento' } },
        ],
      },
      { texto: 'Você tem estas categorias de receita.' },
    );

    const { texto } = await conversar(usuario, 'quais são minhas categorias de receita?');
    expect(texto).toBe('Vou olhar.\n\nVocê tem estas categorias de receita.');

    const receitas = await prisma.categoria.findMany({
      where: { usuarioId: usuario.usuarioId, tipo: 'receita', excluidoEm: null },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, tipo: true },
    });
    const segundo = modelo.pedidos[1];
    expect(segundo?.mensagens.at(-2)).toMatchObject({
      papel: 'assistente',
      conteudo: [
        { tipo: 'texto', texto: 'Vou olhar.' },
        { tipo: 'ferramenta', nome: 'listar_categorias' },
        { tipo: 'ferramenta', nome: 'listar_categorias' },
      ],
    });
    const resultados = segundo?.mensagens.at(-1)?.conteudo as BlocoLlm[];
    expect(resultados).toHaveLength(2);
    const [certo, invalido] = resultados;
    expect(certo).toMatchObject({ tipo: 'resultado', erro: false });
    const lidas = JSON.parse(certo?.tipo === 'resultado' ? certo.conteudo : '{}') as {
      categorias: { id: string; nome: string; tipo: string }[];
    };
    expect([...lidas.categorias].sort((a, b) => a.nome.localeCompare(b.nome))).toEqual(receitas);
    expect(JSON.stringify(lidas)).not.toContain('Receita do outro');
    expect(invalido).toMatchObject({ tipo: 'resultado', erro: true });

    const logs = await logsDo(usuario.usuarioId);
    expect(logs.map(({ ferramenta, erro }) => [ferramenta, erro])).toEqual([
      ['listar_categorias,listar_categorias', null],
      [null, null],
    ]);
  });

  it('RN-087 erro transitório do modelo: tenta de novo; erro definitivo: avisa e grava a falha', async () => {
    const usuario = await usuarioNovo();
    modelo.roteirizar({ erro: new ErroLlm('sobrecarga', true) }, { texto: 'Voltei.' });
    const recuperada = await conversar(usuario, 'oi');
    expect(recuperada.texto).toBe('Voltei.');
    expect(recuperada.eventos.some(({ tipo }) => tipo === 'erro')).toBe(false);
    expect((await logsDo(usuario.usuarioId)).map(({ erro }) => erro)).toEqual(['sobrecarga', null]);

    modelo.roteirizar({ erro: new ErroLlm('chave inválida', false) });
    const falha = await conversar(usuario, 'e aí?');
    expect(falha.eventos.slice(0, -1)).toEqual([
      { tipo: 'erro', codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_FALHA },
    ]);
    expect(falha.eventos.at(-1)?.tipo).toBe('fim');
    expect(modelo.pedidos).toHaveLength(3);
    const mensagens = await mensagensDo(usuario.usuarioId);
    expect(mensagens.at(-1)).toMatchObject({
      id: falha.mensagemId,
      autor: 'mony',
      conteudo: MENSAGEM_FALHA,
    });
    expect((await logsDo(usuario.usuarioId)).at(-1)?.erro).toBe('chave inválida');
  });

  it('Idempotency-Key: o reenvio repete a resposta; depois de uma falha, refaz sem duplicar a mensagem', async () => {
    const usuario = await usuarioNovo();
    const chave = randomUUID();
    const primeira = await conversar(usuario, 'oi', chave);
    const repetida = await conversar(usuario, 'oi', chave);
    expect(repetida.texto).toBe(primeira.texto);
    expect(repetida.mensagemId).toBe(primeira.mensagemId);
    expect(modelo.pedidos).toHaveLength(1);
    expect(await mensagensDo(usuario.usuarioId)).toEqual([
      expect.objectContaining({ autor: 'usuario', idempotencyKey: chave }),
      expect.objectContaining({ autor: 'mony', idempotencyKey: `${chave}:resposta` }),
    ]);

    const outra = randomUUID();
    modelo.roteirizar({ erro: new ErroLlm('chave inválida', false) }, { texto: 'Agora foi.' });
    expect((await conversar(usuario, 'de novo', outra)).eventos[0]?.tipo).toBe('erro');
    const refeita = await conversar(usuario, 'de novo', outra);
    expect(refeita.texto).toBe('Agora foi.');
    const mensagens = await mensagensDo(usuario.usuarioId);
    expect(mensagens.slice(2).map(({ autor, conteudo }) => [autor, conteudo])).toEqual([
      ['usuario', 'de novo'],
      ['mony', MENSAGEM_FALHA],
      ['mony', 'Agora foi.'],
    ]);
    // O modelo não recebe a falha anterior como resposta à mesma mensagem.
    expect(modelo.pedidos.at(-1)?.mensagens.at(-1)).toEqual({
      papel: 'usuario',
      conteudo: 'de novo',
    });
  });

  it('GET /mony/conversa: páginas por cursor, busca no texto e só do usuário', async () => {
    const usuario = await usuarioNovo();
    modelo.roteirizar({ texto: 'Olá!' }, { texto: 'Mercado anotado? Ainda não.' });
    await conversar(usuario, 'bom dia');
    await conversar(usuario, 'fui ao mercado');

    const primeira = (await historico(usuario, '?limite=3')).json<PaginaConversa>();
    expect(primeira.itens.map(({ conteudo }) => conteudo)).toEqual([
      'Mercado anotado? Ainda não.',
      'fui ao mercado',
      'Olá!',
    ]);
    expect(primeira.proximoCursor).not.toBeNull();
    const segunda = (
      await historico(usuario, `?limite=3&cursor=${primeira.proximoCursor ?? ''}`)
    ).json<PaginaConversa>();
    expect(segunda.itens.map(({ conteudo }) => conteudo)).toEqual(['bom dia']);
    expect(segunda.proximoCursor).toBeNull();

    const busca = (await historico(usuario, '?texto=MERCADO')).json<PaginaConversa>();
    expect(busca.itens.map(({ autor, conteudo }) => [autor, conteudo])).toEqual([
      ['mony', 'Mercado anotado? Ainda não.'],
      ['usuario', 'fui ao mercado'],
    ]);

    const outro = await usuarioNovo();
    expect((await historico(outro)).json<PaginaConversa>()).toEqual({
      itens: [],
      proximoCursor: null,
    });
    expect((await historico(usuario, '?cursor=invalido')).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/v1/mony/conversa' })).statusCode).toBe(401);
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
