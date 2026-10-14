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
import { RascunhosService } from '../src/modulos/mony/rascunhos.service';
import { PROMPT_SISTEMA } from '../src/modulos/mony/prompts/sistema';
import { CONFIG_LOCAL, ConfigMonyService } from '../src/modulos/mony/config.service';

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
    // T-068: o prompt do código, mesmo se outro arquivo de teste ativar uma versão no banco.
    app.get(ConfigMonyService).fixar(CONFIG_LOCAL);
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

  it('RN-080 RN-081 RN-084 "gastei 10": categorias (as mais usadas e [Outra]), forma de pagamento e a despesa gravada', async () => {
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

    const { resposta, eventos } = await conversar(usuario, 'gastei 10');
    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(resposta.headers['x-request-id']).toBeTruthy();
    expect(eventos.map(({ tipo }) => tipo)).toEqual(['texto.delta', 'componente', 'fim']);
    expect(eventos[0]).toEqual({
      tipo: 'texto.delta',
      texto: `Anotei ${formatarCentavos(1_000)}. Em qual categoria?`,
    });
    const deCategoria = botoes(eventos[1]);
    expect(deCategoria).toHaveLength(5);
    expect(deCategoria[0]?.rotulo).toBe(preferida.nome);
    expect(deCategoria.at(-1)?.rotulo).toBe('Outra');
    expect(await prisma.rascunhoLancamento.count({ where: { usuarioId: usuario.usuarioId } })).toBe(
      1,
    );
    // A regra resolve sem o modelo.
    expect(modelo.pedidos).toEqual([]);

    const escolha = deCategoria[0];
    if (!escolha) throw new Error('sem botão');
    const forma = await tocar(usuario, escolha);
    expect(forma.statusCode, forma.body).toBe(200);
    const comoPagou = forma.json<RespostaAcaoMony>();
    expect(comoPagou.texto).toBe('Como você pagou?');
    // Sem cartão cadastrado, sem o crédito.
    expect(botoes(comoPagou.componente).map(({ rotulo }) => rotulo)).toEqual([
      'Pix',
      'Débito',
      'Dinheiro',
      'Boleto',
    ]);

    const pix = botoes(comoPagou.componente)[0];
    if (!pix) throw new Error('sem botão');
    const chave = randomUUID();
    const fim = (await tocar(usuario, pix, chave)).json<RespostaAcaoMony>();
    expect(fim.texto).toBe(
      `Pronto! Anotei ${formatarCentavos(1_000)} em ${preferida.nome}, no Pix.`,
    );
    // O mesmo toque repetido (rede ruim) não grava de novo; outro toque no botão velho, 410.
    expect((await tocar(usuario, pix, chave)).json<RespostaAcaoMony>()).toEqual(fim);
    const velho = await tocar(usuario, pix);
    expect(velho.statusCode).toBe(410);
    expect(velho.json()).toMatchObject({ erro: { codigo: 'RASCUNHO_EXPIRADO' } });
    expect(await prisma.rascunhoLancamento.count({ where: { usuarioId: usuario.usuarioId } })).toBe(
      0,
    );
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
      ['mony', 'texto', fim.texto, 1],
      ['usuario', 'botao', 'Pix', 0],
      ['mony', 'texto', 'Como você pagou?', 1],
      ['usuario', 'botao', preferida.nome, 0],
      ['mony', 'texto', `Anotei ${formatarCentavos(1_000)}. Em qual categoria?`, 1],
      ['usuario', 'texto', 'gastei 10', 0],
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
    expect(contextoUsuario).toContain('- Agora: 12:00.');
    expect(contextoUsuario).toContain('- Nome: Ana.');
    expect(contextoUsuario).toMatch(/Categorias de despesa: .*Alimentação/);
    expect(contextoUsuario).toContain('- Cartões: nenhum cadastrado.');
    expect(contextoUsuario).toContain('- Orçamentos de outubro/2026: nenhum.');
    // Dados sensíveis não vão ao modelo (doc 08).
    expect(contextoUsuario).not.toContain(usuario.email);
    expect(contextoUsuario).not.toContain('98765');
    expect(pedido?.mensagens).toEqual([{ papel: 'usuario', conteudo: 'oi, Mony' }]);
    expect(pedido?.ferramentas?.map(({ nome }) => nome)).toEqual([
      'listar_categorias',
      'listar_cartoes',
      'criar_categoria',
      'criar_transacao',
      'criar_parcelamento',
      'editar_transacao',
      'excluir_transacao',
      'consultar_transacoes',
      'resumo_periodo',
      'consultar_cartao',
      'pagar_fatura',
      'consultar_orcamentos',
      'definir_orcamento',
      'consultar_metas',
      'atualizar_meta',
      'criar_lembrete',
      'consultar_lembretes',
      'ajuda_app',
    ]);

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
    // T-069: os atalhos vêm só na primeira página sem busca.
    expect(primeira.sugestoes).toEqual([
      'Quanto gastei este mês?',
      'Quero anotar um gasto',
      'Quero criar um orçamento',
    ]);
    const segunda = (
      await historico(usuario, `?limite=3&cursor=${primeira.proximoCursor ?? ''}`)
    ).json<PaginaConversa>();
    expect(segunda.itens.map(({ conteudo }) => conteudo)).toEqual(['bom dia']);
    expect(segunda.proximoCursor).toBeNull();
    expect(segunda.sugestoes).toEqual([]);

    const busca = (await historico(usuario, '?texto=MERCADO')).json<PaginaConversa>();
    expect(busca.sugestoes).toEqual([]);
    expect(busca.itens.map(({ autor, conteudo }) => [autor, conteudo])).toEqual([
      ['mony', 'Mercado anotado? Ainda não.'],
      ['usuario', 'fui ao mercado'],
    ]);

    const outro = await usuarioNovo();
    await app.inject({
      method: 'POST',
      url: '/v1/cartoes',
      headers: { authorization: `Bearer ${outro.acesso}` },
      payload: {
        nome: 'Inter',
        limiteTotalCentavos: 100_000,
        diaFechamento: 3,
        diaVencimento: 10,
        cor: '#FF7A00',
      },
    });
    expect((await historico(outro)).json<PaginaConversa>()).toEqual({
      itens: [],
      proximoCursor: null,
      sugestoes: [
        'Quanto gastei este mês?',
        'Como está a fatura do Inter?',
        'Quero criar um orçamento',
      ],
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

    // Botão do rascunho de outra pessoa: para quem toca, o rascunho não existe.
    const outro = await usuarioNovo();
    const { eventos } = await conversar(outro, 'gastei 25');
    const alheio = botoes(eventos[1])[0];
    if (!alheio) throw new Error('sem botão');
    expect((await tocar(usuario, alheio)).statusCode).toBe(410);

    // No próprio rascunho, categoria de outra pessoa não vale.
    const meu = botoes((await conversar(usuario, 'gastei 30')).eventos[1])[0];
    if (!meu) throw new Error('sem botão');
    const trocado = await tocar(usuario, {
      ...meu,
      acao: { ...meu.acao, valor: alheio.acao.valor },
    });
    expect(trocado.statusCode).toBe(404);
  });

  async function cartaoNovo(usuario: Usuario, nome: string) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/cartoes',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload: {
        nome,
        limiteTotalCentavos: 500_000,
        diaFechamento: 3,
        diaVencimento: 10,
        cor: '#7C3AED',
      },
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
    return resposta.json<{ id: string; nome: string }>();
  }

  const rascunhoDo = (usuarioId: string) =>
    prisma.rascunhoLancamento.findMany({
      where: { usuarioId },
      select: { id: true, dados: true, campoPendente: true, expiraEm: true },
    });

  it('RN-080 o que a mensagem já diz não vira pergunta: categoria, forma e data saem do texto', async () => {
    const usuario = await usuarioNovo();
    const { texto, eventos } = await conversar(usuario, 'gastei 15,50 ontem no mercado no pix');
    expect(texto).toBe(`Pronto! Anotei ${formatarCentavos(1_550)} em Mercado, no Pix, em 14/10.`);
    // RN-082: o resumo do que foi gravado, com [Desfazer].
    const resumo = eventos.find((evento) => evento.tipo === 'componente');
    expect(resumo).toMatchObject({
      componente: {
        tipo: 'resumo',
        lancamento: {
          tipo: 'despesa',
          descricao: 'Mercado',
          valorCentavos: 1_550,
          data: '2026-10-14',
          categoria: 'Mercado',
          formaPagamento: 'pix',
          cartao: null,
          parcelas: null,
        },
        opcoes: [{ rotulo: 'Desfazer', acao: { tipo: 'desfazer', alvo: 'transacao' } }],
      },
    });
    expect(
      await prisma.transacao.findMany({
        where: { usuarioId: usuario.usuarioId },
        select: { descricao: true, valor: true, data: true, formaPagamento: true, origem: true },
      }),
    ).toEqual([
      {
        descricao: 'Mercado',
        valor: 1_550n,
        data: new Date('2026-10-14T00:00:00Z'),
        formaPagamento: 'pix',
        origem: 'mony',
      },
    ]);
    expect(await rascunhoDo(usuario.usuarioId)).toEqual([]);
  });

  it('RN-080 RN-085 no cartão: a resposta em texto completa o rascunho e grava o parcelamento', async () => {
    const usuario = await usuarioNovo();
    const nubank = await cartaoNovo(usuario, 'Nubank');
    await cartaoNovo(usuario, 'Inter');

    const primeira = await conversar(usuario, 'gastei 80 de iFood no nubank em 3x');
    // Cartão e parcelas vieram no texto; falta a categoria.
    expect(primeira.texto).toBe(`Anotei ${formatarCentavos(8_000)}. Em qual categoria?`);
    const [rascunho] = await rascunhoDo(usuario.usuarioId);
    expect(rascunho).toMatchObject({
      campoPendente: 'categoria',
      dados: {
        valorCentavos: 8_000,
        descricao: 'iFood',
        data: '2026-10-15',
        formaPagamento: 'cartao_credito',
        cartaoId: nubank.id,
        parcelas: 3,
      },
    });
    // RN-088: vale 24 horas.
    expect(rascunho?.expiraEm).toEqual(new Date('2026-10-16T15:00:00Z'));

    const segunda = await conversar(usuario, 'Alimentação');
    expect(segunda.texto).toMatch(
      /^Pronto! Anotei R\$\s80,00 de iFood em Alimentação, no Nubank em 3x de R\$\s26,6\d\.$/,
    );
    expect(modelo.pedidos).toEqual([]);
    const parcelamentos = await prisma.parcelamento.findMany({
      where: { usuarioId: usuario.usuarioId },
      select: { nome: true, valorTotal: true, totalParcelas: true, cartaoId: true },
    });
    expect(parcelamentos).toEqual([
      { nome: 'iFood', valorTotal: 8_000n, totalParcelas: 3, cartaoId: nubank.id },
    ]);
    expect(await rascunhoDo(usuario.usuarioId)).toEqual([]);
  });

  it('RN-080 crédito pelos botões: forma, cartão (com mais de um) e parcelas', async () => {
    const usuario = await usuarioNovo();
    await cartaoNovo(usuario, 'Nubank');
    const inter = await cartaoNovo(usuario, 'Inter');
    const categoria = botoes((await conversar(usuario, 'paguei 120 na farmácia')).eventos[1]);
    const saude = categoria.find(({ rotulo }) => rotulo === 'Outra');
    if (!saude) throw new Error('sem [Outra]');
    const todas = (await tocar(usuario, saude)).json<RespostaAcaoMony>();
    expect(todas.texto).toBe('Escolha a categoria:');
    expect(botoes(todas.componente)).toHaveLength(11);
    const escolhida = botoes(todas.componente).find(({ rotulo }) => rotulo === 'Saúde');
    if (!escolhida) throw new Error('sem Saúde');

    const forma = (await tocar(usuario, escolhida)).json<RespostaAcaoMony>();
    expect(botoes(forma.componente).map(({ rotulo }) => rotulo)).toEqual([
      'Pix',
      'Débito',
      'Crédito',
      'Dinheiro',
      'Boleto',
    ]);
    const credito = botoes(forma.componente).find(({ rotulo }) => rotulo === 'Crédito');
    if (!credito) throw new Error('sem crédito');
    const qualCartao = (await tocar(usuario, credito)).json<RespostaAcaoMony>();
    expect(qualCartao.texto).toBe('Em qual cartão?');
    const botaoInter = botoes(qualCartao.componente).find(({ rotulo }) => rotulo === 'Inter');
    if (!botaoInter) throw new Error('sem Inter');
    const parcelas = (await tocar(usuario, botaoInter)).json<RespostaAcaoMony>();
    expect(parcelas.texto).toBe('À vista ou parcelado?');
    expect(botoes(parcelas.componente).map(({ rotulo }) => rotulo)).toEqual([
      'À vista',
      '2x',
      '3x',
      '4x',
      '5x',
      '6x',
      '10x',
      '12x',
    ]);
    const aVista = botoes(parcelas.componente)[0];
    if (!aVista) throw new Error('sem à vista');
    const fim = (await tocar(usuario, aVista)).json<RespostaAcaoMony>();
    expect(fim.texto).toBe(
      `Pronto! Anotei ${formatarCentavos(12_000)} de Farmácia em Saúde, no Inter.`,
    );
    expect(
      await prisma.transacao.findUnique({
        where: { id: fim.transacaoId ?? '' },
        select: { cartaoId: true, formaPagamento: true, status: true, descricao: true },
      }),
    ).toEqual({
      cartaoId: inter.id,
      formaPagamento: 'cartao_credito',
      status: 'pendente',
      descricao: 'Farmácia',
    });
    // Botão de uma pergunta já respondida.
    const repetido = await tocar(usuario, credito);
    expect(repetido.statusCode).toBe(410);
  });

  it('RN-085 texto que não responde vai ao modelo com o rascunho, e a pergunta volta com os botões', async () => {
    const usuario = await usuarioNovo();
    const pergunta = await conversar(usuario, 'gastei 25');
    const botoesDaPergunta = botoes(pergunta.eventos[1]);

    modelo.roteirizar({ texto: 'Escolha a categoria nos botões abaixo.' });
    const desvio = await conversar(usuario, 'hmm, não sei');
    expect(desvio.texto).toBe('Escolha a categoria nos botões abaixo.');
    expect(desvio.eventos.map(({ tipo }) => tipo).slice(-2)).toEqual(['componente', 'fim']);
    expect(botoes(desvio.eventos.at(-2))).toEqual(botoesDaPergunta);
    expect(modelo.pedidos[0]?.sistema[1]).toContain(
      `Lançamento em andamento (rascunho): ${formatarCentavos(2_500)}; falta a categoria.`,
    );

    // Botão da pergunta anterior respondido por texto: o rascunho andou, a pergunta não é mais essa.
    const porTexto = await conversar(usuario, 'lazer');
    expect(porTexto.texto).toBe('Como você pagou?');
    const primeiroBotao = botoesDaPergunta[0];
    if (!primeiroBotao) throw new Error('sem botão');
    const velho = await tocar(usuario, primeiroBotao);
    expect(velho.statusCode).toBe(409);

    const cancelado = await conversar(usuario, 'cancela');
    expect(cancelado.texto).toBe(
      `Tudo bem, deixei de lado o lançamento de ${formatarCentavos(2_500)}.`,
    );
    expect(await rascunhoDo(usuario.usuarioId)).toEqual([]);
    expect(await prisma.transacao.count({ where: { usuarioId: usuario.usuarioId } })).toBe(0);
  });

  it('RN-088 gasto novo troca o rascunho; vencido não vale e a limpeza diária apaga', async () => {
    const usuario = await usuarioNovo();
    await conversar(usuario, 'gastei 25');
    const novo = await conversar(usuario, 'gastei 30');
    expect(novo.texto).toBe(
      `Deixei de lado o lançamento de ${formatarCentavos(2_500)}. Anotei ${formatarCentavos(3_000)}. Em qual categoria?`,
    );
    const rascunhos = await rascunhoDo(usuario.usuarioId);
    expect(rascunhos).toHaveLength(1);
    expect(rascunhos[0]?.dados).toMatchObject({ valorCentavos: 3_000 });

    // Vencido: o botão dá 410 e o texto vai ao modelo sem rascunho.
    await prisma.rascunhoLancamento.updateMany({
      where: { usuarioId: usuario.usuarioId },
      data: { expiraEm: new Date('2026-10-15T14:59:00Z') },
    });
    const botao = botoes(novo.eventos[1])[0];
    if (!botao) throw new Error('sem botão');
    expect((await tocar(usuario, botao)).statusCode).toBe(410);
    expect(await rascunhoDo(usuario.usuarioId)).toEqual([]);

    // A limpeza apaga os vencidos de todo mundo e deixa os que valem.
    const outro = await usuarioNovo();
    await conversar(outro, 'gastei 40');
    await conversar(usuario, 'gastei 50');
    await prisma.rascunhoLancamento.updateMany({
      where: { usuarioId: usuario.usuarioId },
      data: { expiraEm: new Date('2026-10-15T10:00:00Z') },
    });
    await app.get(RascunhosService).limpar(new Date('2026-10-15T15:00:00Z'));
    expect(await rascunhoDo(usuario.usuarioId)).toEqual([]);
    expect(await rascunhoDo(outro.usuarioId)).toHaveLength(1);
  });

  it('crédito sem cartão cadastrado avisa e pergunta a forma de novo', async () => {
    const usuario = await usuarioNovo();
    const { texto } = await conversar(usuario, 'gastei 50 no mercado no crédito');
    expect(texto).toBe(
      `Anotei ${formatarCentavos(5_000)}. Você ainda não tem cartão de crédito cadastrado. Como você pagou?`,
    );
  });
  async function categoriaDo(usuario: Usuario, nome: string, tipo: 'despesa' | 'receita') {
    const categoria = await prisma.categoria.findFirst({
      where: { usuarioId: usuario.usuarioId, nome, tipo },
      select: { id: true },
    });
    if (!categoria) throw new Error(`sem a categoria ${nome}`);
    return categoria.id;
  }

  /** O que voltou ao modelo como resultado da ferramenta, na chamada seguinte. */
  function resultadosDaFerramenta(chamada: number) {
    const ultima = modelo.pedidos[chamada]?.mensagens.at(-1)?.conteudo;
    if (!Array.isArray(ultima)) throw new Error('sem resultado de ferramenta');
    return (ultima as BlocoLlm[]).map((bloco) =>
      bloco.tipo === 'resultado'
        ? { erro: bloco.erro, dados: JSON.parse(bloco.conteudo) as unknown }
        : null,
    );
  }

  /** Lançamentos feitos agora (o relógio dos testes é fixo; o banco grava a hora de verdade). */
  async function feitoAgora(usuario: Usuario) {
    await prisma.transacao.updateMany({
      where: { usuarioId: usuario.usuarioId },
      data: { criadoEm: new Date('2026-10-15T14:00:00Z') },
    });
  }

  it('RN-082 RN-086 criar_transacao: receita e despesa completas gravam com resumo; incompleta pergunta com botões', async () => {
    const usuario = await usuarioNovo();
    const salario = await categoriaDo(usuario, 'Salário', 'receita');
    const lazer = await categoriaDo(usuario, 'Lazer', 'despesa');
    modelo.roteirizar(
      {
        ferramentas: [
          {
            nome: 'criar_transacao',
            entrada: {
              tipo: 'receita',
              descricao: 'Salário',
              valorCentavos: 500_000,
              categoriaId: salario,
            },
          },
          {
            nome: 'criar_transacao',
            entrada: {
              tipo: 'despesa',
              descricao: 'Cinema',
              valorCentavos: 4_000,
              categoriaId: lazer,
              formaPagamento: 'debito',
              data: '2026-10-14',
            },
          },
        ],
      },
      { texto: 'Anotei os dois.' },
    );
    const { texto, eventos } = await conversar(
      usuario,
      'recebi meu salário de 5 mil e fui ao cinema ontem',
    );
    expect(texto).toBe('Anotei os dois.');
    // Um cartão de resumo por lançamento, depois do texto (RN-086).
    const resumos = eventos.flatMap((evento) =>
      evento.tipo === 'componente' && evento.componente.tipo === 'resumo'
        ? [evento.componente.lancamento]
        : [],
    );
    expect(resumos).toMatchObject([
      { tipo: 'receita', descricao: 'Salário', valorCentavos: 500_000, categoria: 'Salário' },
      { tipo: 'despesa', descricao: 'Cinema', data: '2026-10-14', formaPagamento: 'debito' },
    ]);
    expect(eventos.map(({ tipo }) => tipo).slice(-3)).toEqual(['componente', 'componente', 'fim']);
    expect(resultadosDaFerramenta(1)).toMatchObject([
      { erro: false, dados: { gravado: true } },
      { erro: false, dados: { gravado: true } },
    ]);
    expect(
      await prisma.transacao.findMany({
        where: { usuarioId: usuario.usuarioId },
        orderBy: { valor: 'desc' },
        select: { tipo: true, valor: true, origem: true },
      }),
    ).toEqual([
      { tipo: 'receita', valor: 500_000n, origem: 'mony' },
      { tipo: 'despesa', valor: 4_000n, origem: 'mony' },
    ]);
    // O histórico guarda os componentes da resposta.
    const [resposta] = (await historico(usuario)).json<PaginaConversa>().itens;
    expect(resposta?.componentes.map(({ tipo }) => tipo)).toEqual(['resumo', 'resumo']);

    // Despesa sem forma de pagamento: vira rascunho e a pergunta vem com botões (RN-080).
    modelo.roteirizar(
      {
        ferramentas: [
          {
            nome: 'criar_transacao',
            entrada: {
              tipo: 'despesa',
              descricao: 'Pizza',
              valorCentavos: 6_000,
              categoriaId: lazer,
            },
          },
        ],
      },
      { texto: 'Como você pagou?' },
    );
    const incompleta = await conversar(usuario, 'pedi uma pizza de 60');
    expect(resultadosDaFerramenta(3)).toMatchObject([
      { erro: false, dados: { gravado: false, pergunta: 'Como você pagou?' } },
    ]);
    expect(botoes(incompleta.eventos.at(-2)).map(({ rotulo }) => rotulo)).toEqual([
      'Pix',
      'Débito',
      'Dinheiro',
      'Boleto',
    ]);
    expect(await rascunhoDo(usuario.usuarioId)).toMatchObject([
      { campoPendente: 'forma_pagamento', dados: { descricao: 'Pizza', categoriaId: lazer } },
    ]);
  });

  it('RN-092 criar_transacao com categoria de outra pessoa falha e não grava nada', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    const alheia = await categoriaDo(outro, 'Lazer', 'despesa');
    modelo.roteirizar(
      {
        ferramentas: [
          {
            nome: 'criar_transacao',
            entrada: {
              tipo: 'despesa',
              descricao: 'Cinema',
              valorCentavos: 4_000,
              categoriaId: alheia,
              formaPagamento: 'pix',
            },
          },
        ],
      },
      { texto: 'Não consegui anotar.' },
    );
    await conversar(usuario, 'cinema 40 no pix');
    expect(resultadosDaFerramenta(1)).toMatchObject([
      { erro: true, dados: { erro: { codigo: 'NAO_ENCONTRADO' } } },
    ]);
    expect(await prisma.transacao.count({ where: { usuarioId: usuario.usuarioId } })).toBe(0);
  });

  it('RN-082 [Desfazer] tira o lançamento da Mony em até 24 horas', async () => {
    const usuario = await usuarioNovo();
    const { eventos } = await conversar(usuario, 'gastei 15 no mercado no pix');
    const [desfazer] = botoes(eventos.find((evento) => evento.tipo === 'componente'));
    if (!desfazer) throw new Error('sem Desfazer');
    await feitoAgora(usuario);

    const desfeito = await tocar(usuario, desfazer);
    expect(desfeito.statusCode, desfeito.body).toBe(200);
    expect(desfeito.json<RespostaAcaoMony>().texto).toBe(
      `Pronto, desfiz: Mercado (${formatarCentavos(1_500)}) saiu dos seus lançamentos.`,
    );
    expect(
      await prisma.transacao.count({ where: { usuarioId: usuario.usuarioId, excluidoEm: null } }),
    ).toBe(0);
    expect((await tocar(usuario, desfazer)).statusCode).toBe(404);

    // Depois de 24 horas não desfaz mais.
    const outro = await conversar(usuario, 'gastei 20 no mercado no pix');
    const [tarde] = botoes(outro.eventos.find((evento) => evento.tipo === 'componente'));
    if (!tarde) throw new Error('sem Desfazer');
    await prisma.transacao.updateMany({
      where: { usuarioId: usuario.usuarioId, excluidoEm: null },
      data: { criadoEm: new Date('2026-10-14T14:59:00Z') },
    });
    const expirado = await tocar(usuario, tarde);
    expect(expirado.statusCode).toBe(410);
    expect(expirado.json()).toMatchObject({ erro: { codigo: 'DESFAZER_EXPIRADO' } });

    // Lançamento feito no app não se desfaz pela Mony.
    const manual = await app.inject({
      method: 'POST',
      url: '/v1/transacoes',
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      payload: {
        tipo: 'despesa',
        descricao: 'Feira',
        valorCentavos: 3_000,
        categoriaId: await categoriaDo(usuario, 'Mercado', 'despesa'),
        formaPagamento: 'pix',
      },
    });
    const idManual = manual.json<{ transacao: { id: string } }>().transacao.id;
    const alheio = await tocar(usuario, {
      id: 'desfazer',
      rotulo: 'Desfazer',
      acao: { tipo: 'desfazer', alvo: 'transacao', id: idManual },
    });
    expect(alheio.statusCode).toBe(400);
  });

  it('RN-092 excluir_transacao só pede a confirmação; o botão exclui e o cancelar não mexe', async () => {
    const usuario = await usuarioNovo();
    await conversar(usuario, 'gastei 15 no mercado no pix');
    const [transacao] = await prisma.transacao.findMany({
      where: { usuarioId: usuario.usuarioId },
      select: { id: true },
    });
    if (!transacao) throw new Error('sem transação');
    const pedir = () => {
      modelo.roteirizar(
        { ferramentas: [{ nome: 'excluir_transacao', entrada: { transacaoId: transacao.id } }] },
        { texto: 'Confirma a exclusão?' },
      );
    };

    pedir();
    const pedido = await conversar(usuario, 'apaga o mercado');
    const [excluir, cancelar] = botoes(pedido.eventos.at(-2));
    expect([excluir?.rotulo, cancelar?.rotulo]).toEqual(['Excluir Mercado', 'Cancelar']);
    expect(resultadosDaFerramenta(1)).toMatchObject([{ erro: false, dados: { excluido: false } }]);
    expect(await prisma.transacao.count({ where: { id: transacao.id, excluidoEm: null } })).toBe(1);
    if (!excluir || !cancelar) throw new Error('sem botões');

    const cancelado = await tocar(usuario, cancelar);
    expect(cancelado.json<RespostaAcaoMony>().texto).toBe('Tudo bem, não mexi em nada.');
    expect(await prisma.transacao.count({ where: { id: transacao.id, excluidoEm: null } })).toBe(1);

    const excluido = await tocar(usuario, excluir);
    expect(excluido.json<RespostaAcaoMony>().texto).toBe(
      `Pronto, excluí Mercado (${formatarCentavos(1_500)}).`,
    );
    expect(await prisma.transacao.count({ where: { id: transacao.id, excluidoEm: null } })).toBe(0);

    // De outra pessoa: a ferramenta não acha.
    const outro = await usuarioNovo();
    modelo.roteirizar(
      { ferramentas: [{ nome: 'excluir_transacao', entrada: { transacaoId: transacao.id } }] },
      { texto: 'Não achei.' },
    );
    await conversar(outro, 'apaga');
    expect(resultadosDaFerramenta(3)).toMatchObject([
      { erro: true, dados: { erro: { codigo: 'NAO_ENCONTRADO' } } },
    ]);
  });

  it('consultar_transacoes, editar_transacao, listar_cartoes e criar_parcelamento com [Desfazer]', async () => {
    const usuario = await usuarioNovo();
    const nubank = await cartaoNovo(usuario, 'Nubank');
    await conversar(usuario, 'gastei 15 no mercado no pix');
    const mercado = await categoriaDo(usuario, 'Mercado', 'despesa');
    // Lançada no app, na categoria errada.
    await app.inject({
      method: 'POST',
      url: '/v1/transacoes',
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      payload: {
        tipo: 'despesa',
        descricao: 'Farmácia',
        valorCentavos: 3_000,
        categoriaId: mercado,
        formaPagamento: 'debito',
      },
    });
    const saude = await categoriaDo(usuario, 'Saúde', 'despesa');
    const eletronicos = await categoriaDo(usuario, 'Compras', 'despesa');
    modelo.roteirizar(
      {
        ferramentas: [
          { nome: 'consultar_transacoes', entrada: { texto: 'farm', limite: 5 } },
          { nome: 'listar_cartoes', entrada: {} },
        ],
      },
      { texto: 'Achei.' },
    );
    await conversar(usuario, 'quanto gastei na farmácia?');
    const [consulta, cartoes] = resultadosDaFerramenta(1);
    expect(consulta).toMatchObject({
      erro: false,
      dados: {
        lancamentos: [{ descricao: 'Farmácia', valorCentavos: 3_000, categoria: 'Mercado' }],
        temMais: false,
        totais: { despesasCentavos: 3_000 },
      },
    });
    expect(cartoes).toMatchObject({
      dados: { cartoes: [{ id: nubank.id, nome: 'Nubank', diaFechamento: 3, diaVencimento: 10 }] },
    });
    const farmacia = (consulta?.dados as { lancamentos: { id: string }[] }).lancamentos[0];
    if (!farmacia) throw new Error('sem lançamento');

    modelo.roteirizar(
      {
        ferramentas: [
          {
            nome: 'editar_transacao',
            entrada: { transacaoId: farmacia.id, categoriaId: saude, valorCentavos: 3_250 },
          },
          {
            nome: 'criar_parcelamento',
            entrada: {
              tipo: 'compra_cartao',
              nome: 'Fone',
              valorCentavos: 60_000,
              totalParcelas: 3,
              categoriaId: eletronicos,
              cartaoId: nubank.id,
            },
          },
        ],
      },
      { texto: 'Feito.' },
    );
    const { eventos } = await conversar(
      usuario,
      'a farmácia foi 32,50 em saúde; e o fone de 600 em 3x no nubank',
    );
    const [editado, parcelado] = eventos.flatMap((evento) =>
      evento.tipo === 'componente' && evento.componente.tipo === 'resumo'
        ? [evento.componente]
        : [],
    );
    expect(editado).toMatchObject({
      lancamento: { descricao: 'Farmácia', valorCentavos: 3_250, categoria: 'Saúde' },
      opcoes: [],
    });
    expect(parcelado).toMatchObject({
      lancamento: {
        descricao: 'Fone',
        valorCentavos: 60_000,
        cartao: 'Nubank',
        parcelas: 3,
        valorParcelaCentavos: 20_000,
      },
      opcoes: [{ acao: { tipo: 'desfazer', alvo: 'parcelamento' } }],
    });
    await feitoAgora(usuario);
    const [desfazer] = parcelado?.opcoes ?? [];
    if (!desfazer) throw new Error('sem Desfazer');
    expect((await tocar(usuario, desfazer)).json<RespostaAcaoMony>().texto).toBe(
      'Pronto, desfiz: Fone em 3x saiu dos seus lançamentos.',
    );
    expect(
      await prisma.parcelamento.findFirst({
        where: { usuarioId: usuario.usuarioId },
        select: { status: true },
      }),
    ).toEqual({ status: 'cancelada' });
  });
  it('resumo_periodo: totais do mês até hoje, categorias e o período anterior do mesmo tamanho', async () => {
    const usuario = await usuarioNovo();
    const mercado = await categoriaDo(usuario, 'Mercado', 'despesa');
    const lazer = await categoriaDo(usuario, 'Lazer', 'despesa');
    const salario = await categoriaDo(usuario, 'Salário', 'receita');
    const lancar = (dados: Record<string, unknown>) =>
      prisma.transacao.create({
        data: {
          usuarioId: usuario.usuarioId,
          descricao: 'Teste',
          status: 'pago',
          formaPagamento: 'pix',
          ...dados,
        } as Parameters<typeof prisma.transacao.create>[0]['data'],
      });
    await lancar({
      tipo: 'despesa',
      valor: 30_000n,
      data: new Date('2026-10-02T00:00:00Z'),
      categoriaId: mercado,
    });
    await lancar({
      tipo: 'despesa',
      valor: 10_000n,
      data: new Date('2026-10-10T00:00:00Z'),
      categoriaId: lazer,
    });
    await lancar({
      tipo: 'receita',
      valor: 500_000n,
      data: new Date('2026-10-05T00:00:00Z'),
      categoriaId: salario,
    });
    await lancar({
      tipo: 'despesa',
      valor: 20_000n,
      data: new Date('2026-09-20T00:00:00Z'),
      categoriaId: lazer,
    });
    // Fora dos dois períodos.
    await lancar({
      tipo: 'despesa',
      valor: 99_000n,
      data: new Date('2026-09-01T00:00:00Z'),
      categoriaId: lazer,
    });

    modelo.roteirizar(
      { ferramentas: [{ nome: 'resumo_periodo', entrada: {} }] },
      { texto: 'Você gastou R$ 400,00 neste mês.' },
    );
    await conversar(usuario, 'como estou neste mês?');
    expect(resultadosDaFerramenta(1)).toEqual([
      {
        erro: false,
        dados: {
          periodo: { de: '2026-10-01', ate: '2026-10-15' },
          receitasCentavos: 500_000,
          despesasCentavos: 40_000,
          saldoCentavos: 460_000,
          categorias: [
            { nome: 'Mercado', totalCentavos: 30_000, percentual: 75 },
            { nome: 'Lazer', totalCentavos: 10_000, percentual: 25 },
          ],
          anterior: {
            periodo: { de: '2026-09-16', ate: '2026-09-30' },
            receitasCentavos: 0,
            despesasCentavos: 20_000,
            saldoCentavos: -20_000,
          },
        },
      },
    ]);
  });

  it('RN-092 consultar_cartao e pagar_fatura: o pagamento só acontece no toque em [Pagar]', async () => {
    const usuario = await usuarioNovo();
    const nubank = await cartaoNovo(usuario, 'Nubank');
    const compra = await app.inject({
      method: 'POST',
      url: '/v1/transacoes',
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      payload: {
        tipo: 'despesa',
        descricao: 'Tênis',
        valorCentavos: 30_000,
        data: '2026-10-01',
        categoriaId: await categoriaDo(usuario, 'Compras', 'despesa'),
        formaPagamento: 'cartao_credito',
        cartaoId: nubank.id,
      },
    });
    expect(compra.statusCode, compra.body).toBe(201);

    modelo.roteirizar(
      { ferramentas: [{ nome: 'consultar_cartao', entrada: { cartaoId: nubank.id } }] },
      { texto: 'Sua fatura tem R$ 300,00.' },
    );
    await conversar(usuario, 'como está o nubank?');
    const [consulta] = resultadosDaFerramenta(1);
    expect(consulta).toMatchObject({
      erro: false,
      dados: {
        cartao: { nome: 'Nubank', limiteUsadoCentavos: 30_000, limiteDisponivelCentavos: 470_000 },
        faturas: [{ saldoCentavos: 30_000, dataVencimento: '2026-10-10' }],
      },
    });
    const faturaId = (consulta?.dados as { faturas: { id: string }[] }).faturas[0]?.id ?? '';

    modelo.roteirizar(
      { ferramentas: [{ nome: 'pagar_fatura', entrada: { faturaId, valorCentavos: 10_000 } }] },
      { texto: 'Confirma o pagamento?' },
    );
    const pedido = await conversar(usuario, 'paga 100 da fatura');
    const [pagar, cancelar] = botoes(pedido.eventos.at(-2));
    expect([pagar?.rotulo, cancelar?.rotulo]).toEqual([
      `Pagar ${formatarCentavos(10_000)}`,
      'Cancelar',
    ]);
    const pagamentos = () =>
      prisma.transacao.count({
        where: { usuarioId: usuario.usuarioId, natureza: 'pagamento_fatura', excluidoEm: null },
      });
    expect(await pagamentos()).toBe(0);
    if (!pagar) throw new Error('sem [Pagar]');

    const pago = await tocar(usuario, pagar);
    expect(pago.statusCode, pago.body).toBe(200);
    expect(pago.json<RespostaAcaoMony>().texto).toBe(
      `Pronto, registrei o pagamento de ${formatarCentavos(10_000)} da fatura do Nubank. Ainda faltam ${formatarCentavos(20_000)} nessa fatura.`,
    );
    expect(await pagamentos()).toBe(1);

    // Mais do que falta, ou cartão de outra pessoa: a ferramenta recusa.
    const outro = await usuarioNovo();
    modelo.roteirizar(
      {
        ferramentas: [
          { nome: 'pagar_fatura', entrada: { faturaId, valorCentavos: 50_000 } },
          { nome: 'consultar_cartao', entrada: { cartaoId: nubank.id } },
        ],
      },
      { texto: 'Não deu.' },
    );
    await conversar(usuario, 'paga 500');
    expect(resultadosDaFerramenta(5)).toMatchObject([
      { erro: true, dados: { erro: { codigo: 'REQUISICAO_INVALIDA' } } },
      { erro: false },
    ]);
    modelo.roteirizar(
      { ferramentas: [{ nome: 'consultar_cartao', entrada: { cartaoId: nubank.id } }] },
      { texto: 'Não achei.' },
    );
    await conversar(outro, 'e o nubank?');
    expect(resultadosDaFerramenta(7)).toMatchObject([
      { erro: true, dados: { erro: { codigo: 'NAO_ENCONTRADO' } } },
    ]);
  });

  it('definir_orcamento, consultar_orcamentos, consultar_metas e atualizar_meta', async () => {
    const usuario = await usuarioNovo();
    const mercado = await categoriaDo(usuario, 'Mercado', 'despesa');
    await conversar(usuario, 'gastei 150 no mercado no pix');
    const meta = await app.inject({
      method: 'POST',
      url: '/v1/metas',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload: { titulo: 'Viagem', valorAlvoCentavos: 100_000 },
    });
    const metaId = meta.json<{ id: string }>().id;

    modelo.roteirizar(
      {
        ferramentas: [
          { nome: 'definir_orcamento', entrada: { categoriaId: mercado, limiteCentavos: 50_000 } },
          { nome: 'atualizar_meta', entrada: { metaId, aporteCentavos: 100_000 } },
        ],
      },
      {
        ferramentas: [
          { nome: 'consultar_orcamentos', entrada: {} },
          { nome: 'consultar_metas', entrada: {} },
        ],
      },
      { texto: 'Feito.' },
    );
    await conversar(usuario, 'limite de 500 no mercado e guardei mil na viagem');
    expect(resultadosDaFerramenta(1)).toMatchObject([
      {
        erro: false,
        dados: { definido: true, mes: '2026-10', limiteCentavos: 50_000, gastoCentavos: 15_000 },
      },
      {
        erro: false,
        dados: { meta: { valorAtualCentavos: 100_000, percentual: 100 }, sugerirConclusao: true },
      },
    ]);
    expect(resultadosDaFerramenta(2)).toMatchObject([
      {
        erro: false,
        dados: {
          mes: '2026-10',
          orcamentos: [
            { categoria: 'Mercado', gastoCentavos: 15_000, percentualUsado: 30, faixa: 'normal' },
          ],
        },
      },
      {
        erro: false,
        dados: {
          metas: [{ id: metaId, valorAtualCentavos: 100_000 }],
          guardadoNoMesCentavos: 100_000,
        },
      },
    ]);

    modelo.roteirizar(
      { ferramentas: [{ nome: 'atualizar_meta', entrada: { metaId, concluida: true } }] },
      { texto: 'Meta concluída!' },
    );
    await conversar(usuario, 'pode concluir');
    expect(resultadosDaFerramenta(4)).toMatchObject([
      { erro: false, dados: { meta: { concluida: true }, sugerirConclusao: false } },
    ]);
  });

  it('RN-075 criar_lembrete no fuso do usuário com [Ver lembrete], consultar_lembretes e ajuda_app', async () => {
    const usuario = await usuarioNovo();
    modelo.roteirizar(
      {
        ferramentas: [
          {
            nome: 'criar_lembrete',
            entrada: { titulo: 'Pagar o IPVA', data: '2026-10-20', hora: '09:00' },
          },
          {
            nome: 'criar_lembrete',
            entrada: {
              titulo: 'Academia',
              data: '2026-10-15',
              hora: '19:30',
              repeticao: { frequencia: 'semanal', dias: ['seg', 'qua'] },
              alarme: true,
            },
          },
          // No passado: a falha volta ao modelo (RN-087).
          {
            nome: 'criar_lembrete',
            entrada: { titulo: 'Ontem', data: '2026-10-14', hora: '09:00' },
          },
        ],
      },
      { texto: 'Combinado!' },
    );
    const { eventos } = await conversar(usuario, 'me lembra do IPVA dia 20 às 9h e da academia');
    expect(resultadosDaFerramenta(1)).toMatchObject([
      {
        erro: false,
        dados: { criado: true, titulo: 'Pagar o IPVA', data: '2026-10-20', hora: '09:00' },
      },
      {
        erro: false,
        // Quinta não é dia da regra: o primeiro é a segunda, 19/10.
        dados: {
          data: '2026-10-19',
          hora: '19:30',
          repeticao: 'FREQ=WEEKLY;BYDAY=MO,WE',
          canais: ['push', 'alarme'],
        },
      },
      { erro: true, dados: { erro: { codigo: 'REQUISICAO_INVALIDA' } } },
    ]);
    const gravados = await prisma.lembrete.findMany({
      where: { usuarioId: usuario.usuarioId },
      orderBy: { dataHora: 'asc' },
    });
    expect(gravados.map(({ dataHora }) => dataHora.toISOString())).toEqual([
      '2026-10-19T22:30:00.000Z',
      '2026-10-20T12:00:00.000Z',
    ]);
    const verLembrete = eventos
      .flatMap((evento) => botoes(evento))
      .find(({ id }) => id === 'ver-lembrete');
    expect(verLembrete?.acao).toEqual({
      tipo: 'abrir',
      link: `mony://lembretes/${gravados[1]?.id ?? ''}`,
    });

    modelo.roteirizar(
      {
        ferramentas: [
          { nome: 'consultar_lembretes', entrada: {} },
          { nome: 'ajuda_app', entrada: { pergunta: 'como eu exporto o relatório em PDF?' } },
          { nome: 'ajuda_app', entrada: { pergunta: 'qual a previsão do tempo?' } },
        ],
      },
      { texto: 'Pronto.' },
    );
    await conversar(usuario, 'quais meus lembretes? e como exporto o relatório?');
    const [lembretes, ajuda, semAjuda] = resultadosDaFerramenta(3);
    expect(lembretes).toMatchObject({
      erro: false,
      dados: {
        total: 2,
        lembretes: [
          { titulo: 'Academia', data: '2026-10-19', hora: '19:30', jaTocou: false },
          { titulo: 'Pagar o IPVA', data: '2026-10-20', hora: '09:00', repeticao: null },
        ],
      },
    });
    // O mais próximo primeiro; os outros que também batem vêm depois (até 3).
    expect(ajuda?.erro).toBe(false);
    expect((ajuda?.dados as { topicos: { titulo: string }[] }).topicos[0]?.titulo).toBe(
      'Relatórios, exportação e histórico de preços',
    );
    expect(semAjuda).toMatchObject({ erro: false, dados: { topicos: [] } });
  });

  it('RN-081 RN-090 o que foi confirmado para o estabelecimento vem primeiro nos botões e no contexto', async () => {
    const usuario = await usuarioNovo();
    const nubank = await cartaoNovo(usuario, 'Nubank');
    await cartaoNovo(usuario, 'Inter');
    const lazer = await categoriaDo(usuario, 'Lazer', 'despesa');
    // Lazer fica fora das 4 mais usadas.
    for (const [nome, vezes] of [
      ['Mercado', 3],
      ['Transporte', 2],
      ['Moradia', 2],
      ['Saúde', 2],
    ] as const) {
      const categoriaId = await categoriaDo(usuario, nome, 'despesa');
      await prisma.transacao.createMany({
        data: Array.from({ length: vezes }, () => ({
          usuarioId: usuario.usuarioId,
          tipo: 'despesa' as const,
          descricao: 'Antes',
          valor: 1_000n,
          data: new Date('2026-10-01T00:00:00Z'),
          status: 'pago' as const,
          formaPagamento: 'pix' as const,
          categoriaId,
        })),
      });
    }
    const rotulos = (opcoes: OpcaoBotao[]) => opcoes.map(({ rotulo }) => rotulo);
    const escolher = async (opcoes: OpcaoBotao[], rotulo: string) => {
      const opcao = opcoes.find((item) => item.rotulo === rotulo);
      if (!opcao) throw new Error(`sem o botão ${rotulo}: ${rotulos(opcoes).join(', ')}`);
      const resposta = await tocar(usuario, opcao);
      expect(resposta.statusCode, resposta.body).toBe(200);
      return botoes(resposta.json<RespostaAcaoMony>().componente);
    };
    const preferencia = () =>
      prisma.preferenciaAprendida.findMany({
        where: { usuarioId: usuario.usuarioId },
        select: {
          chave: true,
          categoriaId: true,
          cartaoId: true,
          formaPagamento: true,
          contagem: true,
        },
      });

    // Primeira vez: sem preferência, as mais usadas; Lazer só pelo [Outra].
    const primeira = botoes((await conversar(usuario, 'gastei 50 no cinema')).eventos[1]);
    expect(rotulos(primeira)).toEqual(['Mercado', 'Moradia', 'Saúde', 'Transporte', 'Outra']);
    const todas = await escolher(primeira, 'Outra');
    const formas = await escolher(todas, 'Lazer');
    expect(rotulos(formas)).toEqual(['Pix', 'Débito', 'Crédito', 'Dinheiro', 'Boleto']);
    const cartoes = await escolher(formas, 'Crédito');
    expect(rotulos(cartoes)).toEqual(['Inter', 'Nubank']);
    await escolher(await escolher(cartoes, 'Nubank'), 'À vista');
    expect(await preferencia()).toEqual([
      {
        chave: 'cinema',
        categoriaId: lazer,
        cartaoId: nubank.id,
        formaPagamento: 'cartao_credito',
        contagem: 1,
      },
    ]);

    // Segunda vez: Lazer, Crédito e Nubank na frente (RN-081); a mesma combinação soma 1 (RN-090).
    const segunda = botoes((await conversar(usuario, 'gastei 40 no Cinema')).eventos[1]);
    expect(rotulos(segunda)).toEqual(['Lazer', 'Mercado', 'Moradia', 'Saúde', 'Outra']);
    const formas2 = await escolher(segunda, 'Lazer');
    expect(rotulos(formas2)[0]).toBe('Crédito');
    const cartoes2 = await escolher(formas2, 'Crédito');
    expect(rotulos(cartoes2)).toEqual(['Nubank', 'Inter']);
    await escolher(await escolher(cartoes2, 'Nubank'), 'À vista');
    expect((await preferencia())[0]?.contagem).toBe(2);

    // Outra combinação toma o lugar e começa do 1.
    const terceira = botoes((await conversar(usuario, 'gastei 30 no cinema no pix')).eventos[1]);
    expect(rotulos(terceira)[0]).toBe('Lazer');
    await escolher(terceira, 'Lazer');
    expect(await preferencia()).toEqual([
      { chave: 'cinema', categoriaId: lazer, cartaoId: null, formaPagamento: 'pix', contagem: 1 },
    ]);

    // O modelo recebe os hábitos no contexto.
    modelo.roteirizar({ texto: 'Oi!' });
    await conversar(usuario, 'oi');
    expect(modelo.pedidos[0]?.sistema[1]).toContain(
      '- Hábitos (estabelecimento → categoria, forma ou cartão): cinema → Lazer, Pix.',
    );
  });

  it('RN-089 depois de gravar, o resumo traz o impacto no orçamento da categoria e no limite do cartão', async () => {
    const usuario = await usuarioNovo();
    const mercado = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId, nome: 'Mercado', tipo: 'despesa' },
    });
    const orcamento = await app.inject({
      method: 'PUT',
      url: '/v1/orcamentos',
      headers: { authorization: `Bearer ${usuario.acesso}` },
      payload: { categoriaId: mercado.id, competencia: '2026-10-01', valorLimiteCentavos: 10_000 },
    });
    expect(orcamento.statusCode, orcamento.body).toBe(200);
    await cartaoNovo(usuario, 'Nubank');
    const resumo = (eventos: EventoMony[]) => {
      const evento = eventos.find(
        (item) => item.tipo === 'componente' && item.componente.tipo === 'resumo',
      );
      return evento?.tipo === 'componente' && evento.componente.tipo === 'resumo'
        ? evento.componente.lancamento
        : undefined;
    };

    const normal = await conversar(usuario, 'gastei 50 no mercado no pix');
    expect(resumo(normal.eventos)?.impacto).toEqual({
      orcamento: {
        categoria: 'Mercado',
        competencia: '2026-10-01',
        percentualUsado: 50,
        restanteCentavos: 5_000,
        faixa: 'normal',
      },
      cartao: null,
      comentario: `Mercado: 50% do orçamento de outubro, faltam ${formatarCentavos(5_000)}.`,
    });

    const noCartao = await conversar(usuario, 'gastei 35 no mercado no nubank à vista');
    const impacto = resumo(noCartao.eventos)?.impacto;
    expect(impacto?.orcamento).toMatchObject({ percentualUsado: 85, faixa: 'atencao' });
    expect(impacto?.cartao).toEqual({
      cartao: 'Nubank',
      percentualUsado: 0,
      disponivelCentavos: 496_500,
      faixa: 'normal',
    });
    expect(impacto?.comentario).toBe(
      `Atenção: Mercado já usou 85% do orçamento de outubro; faltam ${formatarCentavos(1_500)}. Nubank: 0% do limite usado, ${formatarCentavos(496_500)} disponíveis.`,
    );

    const estourou = await conversar(usuario, 'gastei 30 no mercado no pix');
    expect(resumo(estourou.eventos)?.impacto?.comentario).toBe(
      `Mercado passou ${formatarCentavos(1_500)} do orçamento de outubro (115%).`,
    );

    // Sem orçamento na categoria e sem cartão, não há o que comentar.
    const semImpacto = await conversar(usuario, 'gastei 10 em lazer no pix');
    expect(resumo(semImpacto.eventos)).toBeDefined();
    expect(resumo(semImpacto.eventos)?.impacto).toBeUndefined();
    expect(modelo.pedidos).toEqual([]);
  });
});
