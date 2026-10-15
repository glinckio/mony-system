/**
 * Foto, print e PDF na Mony (T-065), com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`): o app
 * envia o arquivo em `POST /arquivos` e manda o `arquivoId` em `POST /mony/mensagens`; o modelo
 * (falso, com roteiro) lê pela ferramenta `ler_documento`, e os lançamentos só são gravados no
 * toque em [Confirmar] (RN-083), um cartão por lançamento e [Confirmar todos] (RN-086).
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { formatarCentavos } from '@mony/shared/dinheiro';
import {
  type ComponenteMony,
  type EventoMony,
  eventoMonyDoSse,
  LeitorSse,
  type OpcaoBotao,
  type RespostaAcaoMony,
} from '@mony/shared/mony';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import {
  ArmazenamentoArquivos,
  ArmazenamentoMemoria,
} from '../src/core/arquivos/armazenamento-arquivos';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { LIMITES_PLANO_PADRAO } from '../src/core/dados-iniciais/padroes';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { LlmFake } from '../src/integracoes/ia/llm-fake';
import { ErroLlm, LlmProvider } from '../src/integracoes/ia/llm.provider';
import {
  MENSAGEM_LEITURA_FALHOU,
  MENSAGEM_LEITURA_INVALIDA,
} from '../src/modulos/mony/documentos.service';
import { PROMPT_LEITURA } from '../src/modulos/mony/prompts/leitura';
import { botaoVerPlanos } from '../src/modulos/mony/aviso-limite';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface Lido {
  tipo?: 'despesa' | 'receita';
  descricao: string;
  valorCentavos: number;
  data?: string | null;
  formaPagamento?: string | null;
  cartao?: string | null;
  parcelas?: number | null;
  parcelaAtual?: number | null;
  parcelaTotal?: number | null;
  categoria?: string | null;
}

/** A entrada da ferramenta `ler_documento`, como o modelo mandaria. */
function leitura(
  lancamentos: Lido[],
  extra: { documento?: string; estabelecimento?: string | null; aviso?: string | null } = {},
) {
  return {
    documento: extra.documento ?? 'cupom',
    estabelecimento: extra.estabelecimento ?? null,
    aviso: extra.aviso ?? null,
    lancamentos: lancamentos.map((lido) => ({
      tipo: 'despesa',
      data: '2026-10-14',
      formaPagamento: null,
      cartao: null,
      parcelas: null,
      parcelaAtual: null,
      parcelaTotal: null,
      categoria: null,
      ...lido,
    })),
  };
}

describe.runIf(ativo)('integração: foto, print e PDF na Mony', () => {
  let app: NestFastifyApplication;
  let modelo: LlmFake;
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
    const llm = app.get(LlmProvider);
    if (!(llm instanceof LlmFake)) throw new Error('os testes usam IA_PROVEDOR=fake');
    modelo = llm;
  });

  beforeEach(() => {
    modelo.limpar();
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

  async function chamar(usuario: Usuario, metodo: 'GET' | 'POST', url: string, corpo?: object) {
    return app.inject({
      method: metodo,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(corpo === undefined ? {} : { payload: corpo }),
    });
  }

  /** Pede a URL de envio e simula o envio ao S3. */
  async function arquivo(
    usuario: Usuario,
    { tipo = 'foto', tipoConteudo = 'image/jpeg', tamanho = 300_000 } = {},
  ): Promise<string> {
    const preparo = await chamar(usuario, 'POST', '/arquivos', {
      tipo,
      tipoConteudo,
      tamanho: Math.min(tamanho, 10 * 1024 * 1024),
    });
    expect(preparo.statusCode, preparo.body).toBe(201);
    const { id } = preparo.json<{ id: string }>();
    const anexo = await prisma.anexo.findUniqueOrThrow({ where: { id } });
    armazenamento.simularEnvio(anexo.arquivoUrl, tamanho, tipoConteudo);
    return id;
  }

  async function conversar(usuario: Usuario, arquivoId: string, chave?: string) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/mony/mensagens',
      headers: {
        authorization: `Bearer ${usuario.acesso}`,
        ...(chave ? { 'idempotency-key': chave } : {}),
      },
      payload: { arquivoId },
    });
    const eventos = new LeitorSse()
      .ler(resposta.body)
      .map(eventoMonyDoSse)
      .filter((evento): evento is EventoMony => evento !== null);
    const componentes = eventos.flatMap((evento) =>
      evento.tipo === 'componente' ? [evento.componente] : [],
    );
    const texto = eventos.flatMap((evento) =>
      evento.tipo === 'texto.delta' ? [evento.texto] : [],
    );
    return { resposta, eventos, componentes, texto: texto.join('') };
  }

  /** O modelo lê o documento: a ferramenta obrigatória com a leitura. */
  function lerComo(entrada: unknown) {
    modelo.roteirizar({ ferramentas: [{ nome: 'ler_documento', entrada }] });
  }

  async function tocar(usuario: Usuario, opcao: OpcaoBotao | undefined) {
    if (!opcao) throw new Error('sem botão');
    return chamar(usuario, 'POST', '/mony/acoes', { acao: opcao.acao });
  }

  const opcao = (componente: ComponenteMony | undefined, id: string) =>
    componente?.opcoes.find((item) => item.id === id);

  const transacoesDo = (usuarioId: string) =>
    prisma.transacao.findMany({
      where: { usuarioId, excluidoEm: null },
      orderBy: { valor: 'asc' },
      select: {
        id: true,
        tipo: true,
        descricao: true,
        valor: true,
        data: true,
        origem: true,
        formaPagamento: true,
        categoria: { select: { nome: true } },
      },
    });

  it('RN-083 RN-086 vários lançamentos: um cartão por lançamento e nada gravado antes do toque', async () => {
    const usuario = await usuarioNovo();
    const arquivoId = await arquivo(usuario);
    lerComo(
      leitura(
        [
          {
            descricao: 'Mercado Bom Preço',
            valorCentavos: 4_590,
            formaPagamento: 'pix',
            categoria: 'mercado',
          },
          { descricao: 'Drogaria Sul', valorCentavos: 2_300, formaPagamento: 'debito' },
          {
            tipo: 'receita',
            descricao: 'Pix de João',
            valorCentavos: 15_000,
            formaPagamento: 'pix',
          },
        ],
        { documento: 'extrato', estabelecimento: 'Banco Azul' },
      ),
    );

    const { resposta, eventos, componentes, texto } = await conversar(usuario, arquivoId);

    expect(resposta.statusCode).toBe(200);
    expect(eventos.map(({ tipo }) => tipo)).toEqual([
      'texto.delta',
      'componente',
      'componente',
      'componente',
      'componente',
      'fim',
    ]);
    expect(texto).toBe(
      `Li o extrato de Banco Azul: 3 lançamentos, ${formatarCentavos(21_890)} no total. Confirme um por um ou todos de uma vez.`,
    );
    const [mercado, drogaria, pix, todos] = componentes;
    expect(mercado).toMatchObject({
      tipo: 'resumo',
      aConfirmar: true,
      lancamento: {
        transacaoId: null,
        tipo: 'despesa',
        descricao: 'Mercado Bom Preço',
        valorCentavos: 4_590,
        data: '2026-10-14',
        categoria: 'Mercado',
        formaPagamento: 'pix',
      },
    });
    expect(mercado?.opcoes.map(({ rotulo }) => rotulo)).toEqual(['Confirmar', 'Descartar']);
    expect(drogaria).toMatchObject({ lancamento: { categoria: null, formaPagamento: 'debito' } });
    // Receita sem categoria lida vai para "Outros".
    expect(pix).toMatchObject({ lancamento: { tipo: 'receita', categoria: 'Outros' } });
    expect(todos?.tipo).toBe('botoes');
    expect(todos?.opcoes.map(({ rotulo }) => rotulo)).toEqual([
      'Confirmar todos',
      'Descartar todos',
    ]);

    // O modelo recebeu a imagem pela URL assinada e a ferramenta obrigatória.
    const [pedido] = modelo.pedidos;
    const anexo = await prisma.anexo.findUniqueOrThrow({ where: { id: arquivoId } });
    expect(pedido?.sistema[0]).toBe(PROMPT_LEITURA);
    expect(pedido?.sistema[1]).toContain('Hoje: 2026-10-15');
    expect(pedido?.sistema[1]).toContain('Mercado');
    expect(pedido?.ferramentaObrigatoria).toBe('ler_documento');
    expect(pedido?.ferramentas?.map(({ nome }) => nome)).toEqual(['ler_documento']);
    expect(pedido?.mensagens[0]?.conteudo).toEqual([
      { tipo: 'imagem', url: expect.stringContaining(`${anexo.arquivoUrl}?leitura`) as string },
      { tipo: 'texto', texto: 'Leia este documento.' },
    ]);

    // RN-083: nada gravado antes da confirmação.
    expect(await transacoesDo(usuario.usuarioId)).toEqual([]);
    const importacao = await prisma.importacaoDocumento.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId },
    });
    expect(importacao).toMatchObject({ arquivoId, tipo: 'foto', status: 'aguardando_confirmacao' });
    expect(
      await prisma.logIa.findMany({
        where: { usuarioId: usuario.usuarioId },
        select: { ferramenta: true, erro: true },
      }),
    ).toEqual([{ ferramenta: 'ler_documento', erro: null }]);
    expect(
      await prisma.mensagem.findMany({
        where: { usuarioId: usuario.usuarioId, autor: 'usuario' },
        select: { tipo: true, anexoId: true, conteudo: true },
      }),
    ).toEqual([{ tipo: 'imagem', anexoId: arquivoId, conteudo: null }]);

    // [Confirmar] no mercado: completo, grava com origem `foto` e o resumo com [Desfazer].
    const confirmado = await tocar(usuario, opcao(mercado, 'confirmar'));
    expect(confirmado.statusCode, confirmado.body).toBe(200);
    const respostaMercado = confirmado.json<RespostaAcaoMony>();
    expect(respostaMercado.texto).toContain(`Anotei ${formatarCentavos(4_590)}`);
    expect(respostaMercado.componente).toMatchObject({
      tipo: 'resumo',
      lancamento: { descricao: 'Mercado Bom Preço', categoria: 'Mercado' },
    });
    expect(respostaMercado.componente?.opcoes.map(({ rotulo }) => rotulo)).toEqual(['Desfazer']);
    expect(await transacoesDo(usuario.usuarioId)).toMatchObject([
      { descricao: 'Mercado Bom Preço', valor: 4_590n, origem: 'foto', formaPagamento: 'pix' },
    ]);

    // O mesmo botão de novo não grava duas vezes.
    const repetido = await tocar(usuario, opcao(mercado, 'confirmar'));
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json<{ erro: { mensagem: string } }>().erro.mensagem).toBe(
      'Esse lançamento já foi confirmado.',
    );

    // [Descartar] na drogaria; [Confirmar todos] grava o que sobrou (a receita).
    const descartado = await tocar(usuario, opcao(drogaria, 'descartar'));
    expect(descartado.json<RespostaAcaoMony>().texto).toBe(
      `Tudo bem, descartei Drogaria Sul (${formatarCentavos(2_300)}).`,
    );
    const resto = await tocar(usuario, opcao(todos, 'confirmar-todos'));
    expect(resto.statusCode, resto.body).toBe(200);
    expect(resto.json<RespostaAcaoMony>().texto).toBe(
      `Pronto! Anotei 1 lançamento, ${formatarCentavos(15_000)} no total.`,
    );
    expect(await transacoesDo(usuario.usuarioId)).toMatchObject([
      { descricao: 'Mercado Bom Preço', origem: 'foto' },
      { tipo: 'receita', descricao: 'Pix de João', origem: 'foto', categoria: { nome: 'Outros' } },
    ]);
    const final = await prisma.importacaoDocumento.findUniqueOrThrow({
      where: { id: importacao.id },
    });
    expect(final.status).toBe('confirmada');
    expect((await tocar(usuario, opcao(todos, 'confirmar-todos'))).statusCode).toBe(409);

    // RN-082: o [Desfazer] vale para o que veio de foto.
    const [gravada] = await transacoesDo(usuario.usuarioId);
    await prisma.transacao.update({
      where: { id: gravada?.id ?? '' },
      data: { criadoEm: new Date('2026-10-15T14:00:00Z') },
    });
    const desfeito = await tocar(usuario, respostaMercado.componente?.opcoes[0]);
    expect(desfeito.statusCode, desfeito.body).toBe(200);
    expect(await transacoesDo(usuario.usuarioId)).toHaveLength(1);
  });

  it('RN-080 o que falta vira pergunta do rascunho; [Confirmar todos] deixa o incompleto para depois', async () => {
    const usuario = await usuarioNovo();
    lerComo(
      leitura([
        { descricao: 'Padaria Pão Bom', valorCentavos: 1_250, categoria: 'Alimentação' },
        {
          descricao: 'Posto Rota',
          valorCentavos: 20_000,
          formaPagamento: 'debito',
          categoria: 'Transporte',
        },
      ]),
    );
    const { componentes } = await conversar(usuario, await arquivo(usuario));
    const [padaria, , todos] = componentes;
    expect(padaria).toMatchObject({ lancamento: { formaPagamento: null } });

    const parcial = (
      await tocar(usuario, opcao(todos, 'confirmar-todos'))
    ).json<RespostaAcaoMony>();
    expect(parcial.texto).toBe(
      `Pronto! Anotei 1 lançamento, ${formatarCentavos(20_000)} no total. Em 1 lançamento falta informação: toque em Confirmar em cada um para eu perguntar.`,
    );

    // Sem a forma de pagamento: a confirmação pergunta, com botões, e grava no fim.
    const pergunta = await tocar(usuario, opcao(padaria, 'confirmar'));
    expect(pergunta.statusCode, pergunta.body).toBe(200);
    const comoPagou = pergunta.json<RespostaAcaoMony>();
    expect(comoPagou.texto).toBe('Como você pagou?');
    expect(comoPagou.transacaoId).toBeNull();
    const pix = comoPagou.componente?.opcoes.find(({ rotulo }) => rotulo === 'Pix');
    const gravado = (await tocar(usuario, pix)).json<RespostaAcaoMony>();
    expect(gravado.texto).toContain(`Anotei ${formatarCentavos(1_250)}`);
    expect(await transacoesDo(usuario.usuarioId)).toMatchObject([
      { descricao: 'Padaria Pão Bom', origem: 'foto', formaPagamento: 'pix' },
      { descricao: 'Posto Rota', origem: 'foto', formaPagamento: 'debito' },
    ]);
    // Em andamento pelo rascunho, o [Confirmar] não vale de novo.
    const denovo = await tocar(usuario, opcao(padaria, 'confirmar'));
    expect(denovo.statusCode).toBe(409);
    expect(
      (
        await prisma.importacaoDocumento.findFirstOrThrow({
          where: { usuarioId: usuario.usuarioId },
        })
      ).status,
    ).toBe('confirmada');
  });

  it('RN-120 RN-123 no gratuito: [Confirmar todos] para no limite de lançamentos; a 4ª leitura do mês só avisa', async () => {
    for (const limite of LIMITES_PLANO_PADRAO) {
      await prisma.limitePlano.upsert({
        where: { recurso: limite.recurso },
        create: limite,
        update: {},
      });
    }
    const usuario = await usuarioNovo();
    await prisma.assinatura.update({
      where: { usuarioId: usuario.usuarioId },
      data: { plano: 'gratuito', testeInicio: null, testeFim: null },
    });
    const usado = (recurso: 'lancamento' | 'leitura_documento', quantidade: number, data: string) =>
      prisma.usoRecurso.create({
        data: {
          usuarioId: usuario.usuarioId,
          recurso,
          data: new Date(`${data}T00:00:00Z`),
          quantidade,
        },
      });
    await usado('leitura_documento', 2, '2026-10-01');
    await usado('lancamento', 1, '2026-10-15');
    const completo = (descricao: string, valorCentavos: number) => ({
      descricao,
      valorCentavos,
      formaPagamento: 'pix',
      categoria: 'Alimentação',
    });
    lerComo(
      leitura([completo('Padaria', 1_000), completo('Feira', 2_000), completo('Açougue', 3_000)]),
    );
    const { componentes } = await conversar(usuario, await arquivo(usuario));
    const [, , acougue, todos] = componentes;

    const resposta = await tocar(usuario, opcao(todos, 'confirmar-todos'));
    expect(resposta.statusCode, resposta.body).toBe(200);
    const parcial = resposta.json<RespostaAcaoMony>();
    expect(parcial.texto).toBe(
      `Pronto! Anotei 2 lançamentos, ${formatarCentavos(3_000)} no total. Você chegou ao limite de 3 lançamentos por dia do plano gratuito. Amanhã libera de novo. Os que faltam continuam aqui para confirmar depois.`,
    );
    expect(parcial.componente).toEqual(botaoVerPlanos());
    expect((await transacoesDo(usuario.usuarioId)).map(({ descricao }) => descricao)).toEqual([
      'Padaria',
      'Feira',
    ]);
    // O que ficou espera: o [Confirmar] dele avisa de novo, sem gravar.
    const sozinho = (await tocar(usuario, opcao(acougue, 'confirmar'))).json<RespostaAcaoMony>();
    expect(sozinho).toEqual({
      texto:
        'Você chegou ao limite de 3 lançamentos por dia do plano gratuito. Amanhã libera de novo.',
      componente: botaoVerPlanos(),
      transacaoId: null,
    });
    expect(await transacoesDo(usuario.usuarioId)).toHaveLength(2);

    // A terceira leitura do mês foi a de cima; a quarta não chega ao modelo.
    modelo.limpar();
    const quarta = await conversar(usuario, await arquivo(usuario));
    expect(quarta.texto).toBe(
      'Você chegou ao limite de 3 leituras de foto, PDF ou cupom por mês do plano gratuito. No mês que vem libera de novo.',
    );
    expect(quarta.componentes).toEqual([botaoVerPlanos()]);
    expect(modelo.pedidos).toEqual([]);
  });

  it('fatura em PDF: crédito no cartão achado pelo final, a parcela vira o parcelamento e o PDF vai como documento', async () => {
    const usuario = await usuarioNovo();
    const cartao = await chamar(usuario, 'POST', '/cartoes', {
      nome: 'Roxinho',
      bandeira: 'mastercard',
      final: '1234',
      limiteTotalCentavos: 500_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#820AD1',
    });
    expect(cartao.statusCode, cartao.body).toBe(201);
    await chamar(usuario, 'POST', '/cartoes', {
      nome: 'Outro',
      final: '9999',
      limiteTotalCentavos: 100_000,
      diaFechamento: 5,
      diaVencimento: 12,
      cor: '#000000',
    });
    lerComo(
      leitura(
        [
          {
            descricao: 'Livraria Letra',
            valorCentavos: 8_990,
            cartao: 'final 1234',
            categoria: 'Educação',
          },
          {
            descricao: 'Loja X',
            valorCentavos: 5_000,
            cartao: 'final 1234',
            categoria: 'Compras',
            data: '2026-09-14',
            parcelaAtual: 2,
            parcelaTotal: 10,
          },
        ],
        { documento: 'fatura', estabelecimento: 'Roxinho' },
      ),
    );

    const { componentes } = await conversar(
      usuario,
      await arquivo(usuario, { tipo: 'pdf', tipoConteudo: 'application/pdf' }),
    );

    expect(modelo.pedidos[0]?.mensagens[0]?.conteudo).toMatchObject([{ tipo: 'documento' }, {}]);
    expect(modelo.pedidos[0]?.sistema[1]).toContain('Roxinho (final 1234)');
    expect(componentes[0]).toMatchObject({
      lancamento: {
        formaPagamento: 'cartao_credito',
        cartao: 'Roxinho',
        parcelas: null,
        aviso: null,
      },
    });
    // T-149: a parcela 2/10 da fatura é a compra de 14/09 em 10x, e o cartão avisa.
    expect(componentes[1]).toMatchObject({
      lancamento: {
        descricao: 'Loja X',
        valorCentavos: 50_000,
        data: '2026-09-14',
        parcelas: 10,
        valorParcelaCentavos: 5_000,
        aviso: 'Parcela 2 de 10: confirmar lança a compra de 14/09 em 10x.',
      },
    });
    const todos = (
      await tocar(usuario, opcao(componentes[2], 'confirmar-todos'))
    ).json<RespostaAcaoMony>();
    expect(todos.texto).toBe(`Pronto! Anotei 2 lançamentos, ${formatarCentavos(58_990)} no total.`);
    const parcelamento = await prisma.parcelamento.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId },
      select: { nome: true, totalParcelas: true, valorTotal: true, dataInicio: true },
    });
    expect(parcelamento).toEqual({
      nome: 'Loja X',
      totalParcelas: 10,
      valorTotal: 50_000n,
      dataInicio: new Date('2026-09-14T00:00:00Z'),
    });
    const gravadas = await prisma.transacao.findMany({
      where: { usuarioId: usuario.usuarioId },
      select: { origem: true, formaPagamento: true, cartaoId: true, faturaId: true },
    });
    // A livraria e as 10 parcelas da Loja X.
    expect(gravadas).toHaveLength(11);
    for (const gravada of gravadas) {
      expect(gravada).toMatchObject({
        origem: 'foto',
        formaPagamento: 'cartao_credito',
        cartaoId: cartao.json<{ id: string }>().id,
      });
      expect(gravada.faturaId).not.toBeNull();
    }
    expect(
      (
        await prisma.importacaoDocumento.findFirstOrThrow({
          where: { usuarioId: usuario.usuarioId },
        })
      ).tipo,
    ).toBe('pdf');
  });

  it('RN-083 T-149 fatura: o que já está lançado fica marcado, e o [Confirmar todos] passa por ele', async () => {
    const usuario = await usuarioNovo();
    const cartao = await chamar(usuario, 'POST', '/cartoes', {
      nome: 'Roxinho',
      bandeira: 'mastercard',
      final: '1234',
      limiteTotalCentavos: 500_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#820AD1',
    });
    expect(cartao.statusCode, cartao.body).toBe(201);
    const cartaoId = cartao.json<{ id: string }>().id;
    const categorias = await chamar(usuario, 'GET', '/categorias');
    const compras = categorias
      .json<{ itens: { id: string; nome: string }[] }>()
      .itens.find(({ nome }) => nome === 'Compras');
    if (!compras) throw new Error('sem a categoria Compras');
    // Já lançados à mão: a livraria e a compra da Loja Y em 3x (a parcela 2 é de 100,00).
    const livraria = await chamar(usuario, 'POST', '/transacoes', {
      tipo: 'despesa',
      descricao: 'Livraria Letra',
      valorCentavos: 8_990,
      data: '2026-10-02',
      categoriaId: compras.id,
      formaPagamento: 'cartao_credito',
      cartaoId,
    });
    expect(livraria.statusCode, livraria.body).toBe(201);
    const lojaY = await chamar(usuario, 'POST', '/parcelamentos', {
      tipo: 'compra_cartao',
      nome: 'Loja Y',
      valorCentavos: 30_000,
      totalParcelas: 3,
      dataInicio: '2026-09-02',
      categoriaId: compras.id,
      cartaoId,
    });
    expect(lojaY.statusCode, lojaY.body).toBe(201);
    const antes = (await transacoesDo(usuario.usuarioId)).length;

    lerComo(
      leitura(
        [
          { descricao: 'LIVRARIA LETRA', valorCentavos: 8_990, data: '2026-10-02' },
          {
            descricao: 'LOJA Y',
            valorCentavos: 10_000,
            data: '2026-09-02',
            parcelaAtual: 2,
            parcelaTotal: 3,
          },
          { descricao: 'Padaria Sol', valorCentavos: 1_500, data: '2026-10-05' },
          // Uma segunda compra igual à da livraria, no mesmo dia: só uma está lançada.
          { descricao: 'LIVRARIA LETRA', valorCentavos: 8_990, data: '2026-10-02' },
        ].map((lido) => ({ ...lido, cartao: 'final 1234', categoria: 'Compras' })),
        { documento: 'fatura', estabelecimento: 'Roxinho' },
      ),
    );
    const { componentes, texto } = await conversar(
      usuario,
      await arquivo(usuario, { tipo: 'pdf', tipoConteudo: 'application/pdf' }),
    );

    expect(texto).toContain('2 deles parecem já estar lançados: confira antes de confirmar.');
    const [livrariaLida, lojaYLida, padaria, segundaLivraria, todos] = componentes;
    expect(livrariaLida).toMatchObject({
      lancamento: {
        aviso: 'Parece que já está lançado: Livraria Letra, 02/10. Confirme só se for outro.',
      },
    });
    expect(lojaYLida).toMatchObject({
      lancamento: {
        aviso: 'Parece que já está lançado: Loja Y (2/3), 02/10. Confirme só se for outro.',
      },
    });
    expect(padaria).toMatchObject({ lancamento: { aviso: null } });
    expect(segundaLivraria).toMatchObject({ lancamento: { aviso: null } });

    const resposta = (
      await tocar(usuario, opcao(todos, 'confirmar-todos'))
    ).json<RespostaAcaoMony>();
    expect(resposta.texto).toBe(
      `Pronto! Anotei 2 lançamentos, ${formatarCentavos(10_490)} no total. Deixei de fora 2 que parecem já estar lançados: se for outro, toque em Confirmar nele.`,
    );
    expect(await transacoesDo(usuario.usuarioId)).toHaveLength(antes + 2);

    // Era outra compra: o [Confirmar] dele grava mesmo assim.
    const outra = await tocar(usuario, opcao(livrariaLida, 'confirmar'));
    expect(outra.statusCode, outra.body).toBe(200);
    expect(await transacoesDo(usuario.usuarioId)).toHaveLength(antes + 3);
    expect((await tocar(usuario, opcao(lojaYLida, 'descartar'))).statusCode).toBe(200);
    const importacao = await prisma.importacaoDocumento.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId },
    });
    expect(importacao.status).toBe('confirmada');
  });

  it('leitura que falha tenta de novo e, com a mesma chave, lê de novo; depois não lê mais', async () => {
    const usuario = await usuarioNovo();
    const arquivoId = await arquivo(usuario);
    const chave = randomUUID();
    const fora = new ErroLlm('A Anthropic respondeu 529', true);
    modelo.roteirizar({ erro: fora }, { erro: fora }, { erro: fora });

    const falha = await conversar(usuario, arquivoId, chave);
    expect(falha.eventos).toEqual([
      { tipo: 'erro', codigo: 'SERVICO_INDISPONIVEL', mensagem: MENSAGEM_LEITURA_FALHOU },
      { tipo: 'fim', mensagemId: expect.any(String) as string },
    ]);
    expect(modelo.pedidos).toHaveLength(3);
    expect(
      await prisma.importacaoDocumento.findMany({
        where: { usuarioId: usuario.usuarioId },
        select: { status: true },
      }),
    ).toEqual([{ status: 'erro' }]);

    lerComo(leitura([{ descricao: 'Feira', valorCentavos: 3_000, formaPagamento: 'dinheiro' }]));
    const lida = await conversar(usuario, arquivoId, chave);
    expect(lida.texto).toBe('Li o cupom. Confere e toque em Confirmar para eu anotar.');
    expect(lida.componentes).toHaveLength(1);
    // A mesma importação, agora aguardando; e a mensagem do usuário não foi gravada de novo.
    expect(
      await prisma.importacaoDocumento.findMany({
        where: { usuarioId: usuario.usuarioId },
        select: { status: true },
      }),
    ).toEqual([{ status: 'aguardando_confirmacao' }]);
    expect(
      await prisma.mensagem.count({ where: { usuarioId: usuario.usuarioId, autor: 'usuario' } }),
    ).toBe(1);

    // Respondido, o reenvio repete a resposta gravada sem chamar o modelo.
    const pedidos = modelo.pedidos.length;
    const repetida = await conversar(usuario, arquivoId, chave);
    expect(repetida.texto).toBe(lida.texto);
    expect(modelo.pedidos).toHaveLength(pedidos);
    // Em outra mensagem, o mesmo arquivo não vale.
    expect((await conversar(usuario, arquivoId)).eventos).toEqual([
      { tipo: 'erro', codigo: 'CONFLITO', mensagem: 'Este arquivo já foi enviado.' },
    ]);
  });

  it('resposta que não serve, documento sem lançamentos e linhas inválidas', async () => {
    const usuario = await usuarioNovo();
    lerComo({ documento: 'cupom' });
    const invalida = await conversar(usuario, await arquivo(usuario));
    expect(invalida.eventos[0]).toEqual({
      tipo: 'erro',
      codigo: 'ERRO_INTERNO',
      mensagem: MENSAGEM_LEITURA_INVALIDA,
    });
    expect(
      await prisma.logIa.findMany({
        where: { usuarioId: usuario.usuarioId },
        select: { ferramenta: true, erro: true },
      }),
    ).toEqual([{ ferramenta: 'ler_documento', erro: 'leitura inválida' }]);

    lerComo(leitura([], { documento: 'outro', aviso: 'A foto está cortada.' }));
    const vazia = await conversar(usuario, await arquivo(usuario));
    expect(vazia.texto).toBe(
      'Li o documento, mas não achei nenhum lançamento. A foto está cortada.',
    );
    expect(vazia.componentes).toEqual([]);

    lerComo(
      leitura([
        { descricao: 'Bar do Zé', valorCentavos: 4_200, formaPagamento: 'pix' },
        { descricao: 'Valor negativo', valorCentavos: -100 },
        { descricao: '', valorCentavos: 100 },
      ]),
    );
    const parcial = await conversar(usuario, await arquivo(usuario));
    expect(parcial.texto).toBe(
      'Li o cupom. Confere e toque em Confirmar para eu anotar. 2 linhas ficaram de fora.',
    );
    expect(parcial.componentes).toHaveLength(1);
  });

  it('RN-092 arquivo e leitura de outra pessoa, HEIC e imagem grande demais', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    lerComo(leitura([{ descricao: 'Mercado', valorCentavos: 1_000, formaPagamento: 'pix' }]));
    const meu = await conversar(usuario, await arquivo(usuario));

    // A leitura é minha: outra pessoa não confirma nem descarta.
    const alheio = await tocar(outro, opcao(meu.componentes[0], 'confirmar'));
    expect(alheio.statusCode).toBe(404);
    expect((await tocar(outro, opcao(meu.componentes[0], 'descartar'))).statusCode).toBe(404);
    expect((await conversar(outro, await arquivo(usuario))).eventos[0]).toMatchObject({
      tipo: 'erro',
      codigo: 'NAO_ENCONTRADO',
    });

    const heic = await conversar(usuario, await arquivo(usuario, { tipoConteudo: 'image/heic' }));
    expect(heic.eventos).toEqual([
      {
        tipo: 'erro',
        codigo: 'REQUISICAO_INVALIDA',
        mensagem: 'A Mony ainda não lê fotos em HEIC. Mande em JPEG ou PNG.',
      },
    ]);
    const grande = await conversar(usuario, await arquivo(usuario, { tamanho: 6 * 1024 * 1024 }));
    expect(grande.eventos[0]).toMatchObject({ tipo: 'erro', codigo: 'REQUISICAO_INVALIDA' });
    expect(modelo.pedidos).toHaveLength(1);
  });
});
