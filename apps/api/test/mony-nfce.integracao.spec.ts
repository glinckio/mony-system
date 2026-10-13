/**
 * QR Code do cupom fiscal na Mony (T-066a), com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`):
 * o app manda o conteúdo do QR em `POST /mony/nfce`; a nota é consultada no provedor (falso), gravada
 * com os itens, e a compra só vira lançamento no [Confirmar] (RN-083). A fila `mony-midia` é falsa:
 * as novas tentativas são chamadas direto, como o worker faria.
 */
import { randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { ComponenteMony, OpcaoBotao, RespostaAcaoMony } from '@mony/shared/mony';
import { calcularDigitoChave } from '@mony/shared/nfce';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { LIMITES_PLANO_PADRAO } from '../src/core/dados-iniciais/padroes';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { cupomDeExemplo, NfceFake } from '../src/integracoes/nfce/nfce-fake';
import { ErroNfce, NfceProvider } from '../src/integracoes/nfce/nfce.provider';
import { botaoVerPlanos } from '../src/modulos/mony/aviso-limite';
import {
  ConsultasNfce,
  type DadosJobReconsulta,
  ESPERAS_RECONSULTA_MS,
  JOB_RECONSULTA_NFCE,
} from '../src/modulos/mony/consultas-nfce.service';
import {
  MENSAGEM_CANCELADA,
  MENSAGEM_DESISTIU,
  MENSAGEM_HOMOLOGACAO,
  MENSAGEM_JA_AGUARDANDO,
  MENSAGEM_JA_LANCADO,
  MENSAGEM_NAO_E_CUPOM,
  MENSAGEM_PEDIR_FOTO,
  MENSAGEM_QR_ENVIADO,
  MENSAGEM_QR_ILEGIVEL,
} from '../src/modulos/mony/nfce-textos';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** Uma chave válida (dígito calculado); `numero` muda a nota, `tipoEmissao` 9 é contingência. */
function chaveNfce(numero: number, tipoEmissao = 1): string {
  const semDigito = `352610123456780001956500100${String(numero).padStart(7, '0')}${String(tipoEmissao)}12345678`;
  return `${semDigito}${String(calcularDigitoChave(semDigito))}`;
}

/** O QR Code versão 3, como o app lê: a URL da Sefaz de SP com a chave no `p`. */
function qr(chave: string, ambiente = 1): string {
  return `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${chave}|3|${String(ambiente)}`;
}

/** Fila falsa que guarda os jobs marcados e diz que estão esperando (`delayed`). */
function filaMidia() {
  const jobs = new Map<string, { nome: string; dados: DadosJobReconsulta; atraso: number }>();
  return {
    jobs,
    add: vi.fn(
      (nome: string, dados: DadosJobReconsulta, opcoes: { jobId: string; delay: number }) => {
        jobs.set(opcoes.jobId, { nome, dados, atraso: opcoes.delay });
        return Promise.resolve({ id: opcoes.jobId });
      },
    ),
    getJob: vi.fn((id: string) =>
      Promise.resolve(jobs.has(id) ? { getState: () => Promise.resolve('delayed') } : undefined),
    ),
    close: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
  };
}

describe.runIf(ativo)('integração: QR Code do cupom fiscal na Mony', () => {
  let app: NestFastifyApplication;
  let provedor: NfceFake;
  let consultas: ConsultasNfce;
  const fila = filaMidia();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');
  let numero = randomInt(1_000_000);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo('2026-10-15T15:00:00Z'))
      .overrideProvider(getQueueToken(FILAS.monyMidia))
      .useValue(fila)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const nfce = app.get(NfceProvider);
    if (!(nfce instanceof NfceFake)) throw new Error('os testes usam NFCE_PROVEDOR=fake');
    provedor = nfce;
    consultas = app.get(ConsultasNfce);
  });

  beforeEach(() => {
    provedor.limpar();
    fila.jobs.clear();
    fila.add.mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** Uma chave que nenhum outro teste usou. */
  const novaChave = (tipoEmissao = 1) => chaveNfce((numero += 1), tipoEmissao);

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
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'android' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  async function chamar(usuario: Usuario, url: string, corpo: object, chave = randomUUID()) {
    return app.inject({
      method: 'POST',
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': chave },
      payload: corpo,
    });
  }

  async function lerQr(usuario: Usuario, conteudo: string): Promise<RespostaAcaoMony> {
    const resposta = await chamar(usuario, '/mony/nfce', { conteudo });
    expect(resposta.statusCode, resposta.body).toBe(200);
    return resposta.json<RespostaAcaoMony>();
  }

  async function tocar(usuario: Usuario, opcao: OpcaoBotao | undefined) {
    if (!opcao) throw new Error('sem botão');
    const resposta = await chamar(usuario, '/mony/acoes', { acao: opcao.acao });
    expect(resposta.statusCode, resposta.body).toBe(200);
    return resposta.json<RespostaAcaoMony>();
  }

  const opcao = (componente: ComponenteMony | null | undefined, id: string) =>
    componente?.opcoes.find((item) => item.id === id);

  const notasDo = (usuarioId: string) =>
    prisma.nfceNota.findMany({
      where: { usuarioId },
      select: {
        id: true,
        chaveAcesso: true,
        emitente: true,
        total: true,
        uf: true,
        formaPagamento: true,
        transacaoId: true,
        data: true,
        itens: {
          select: { descricao: true, quantidade: true, valorUnitario: true },
          orderBy: { descricao: 'asc' },
        },
      },
    });

  const usoDeLeitura = async (usuarioId: string) =>
    (
      await prisma.usoRecurso.aggregate({
        where: { usuarioId, recurso: 'leitura_documento' },
        _sum: { quantidade: true },
      })
    )._sum.quantidade ?? 0;

  it('RN-083 o QR vira a compra a confirmar; confirmar grava e liga a nota à transação', async () => {
    const usuario = await usuarioNovo();
    const chave = novaChave();

    const lida = await lerQr(usuario, qr(chave));

    expect(lida.texto).toBe(
      `Li o cupom de MERCADO EXEMPLO na Sefaz: 3 itens, ${formatarCentavos(7062)}. Confere e toque em Confirmar para eu anotar.`,
    );
    expect(lida.componente).toMatchObject({
      tipo: 'resumo',
      aConfirmar: true,
      lancamento: {
        tipo: 'despesa',
        descricao: 'MERCADO EXEMPLO',
        valorCentavos: 7062,
        data: '2026-10-10',
        categoria: null,
        formaPagamento: 'debito',
      },
    });
    expect(lida.componente?.opcoes.map(({ rotulo }) => rotulo)).toEqual(['Confirmar', 'Descartar']);
    expect(provedor.consultas).toEqual([chave]);
    // Só a chave saiu do servidor; a nota e os itens ficam gravados, a compra ainda não.
    const [nota] = await notasDo(usuario.usuarioId);
    expect(nota).toMatchObject({
      chaveAcesso: chave,
      emitente: 'MERCADO EXEMPLO LTDA',
      total: 7062n,
      uf: 'SP',
      formaPagamento: 'debito',
      transacaoId: null,
    });
    // 18:32 no relógio da loja, no fuso de São Paulo.
    expect(nota?.data.toISOString()).toBe('2026-10-10T21:32:05.000Z');
    expect(
      nota?.itens.map(({ descricao, quantidade, valorUnitario }) => [
        descricao,
        quantidade.toString(),
        valorUnitario,
      ]),
    ).toEqual([
      ['ARROZ TIPO 1 5KG', '1', 2490n],
      ['FEIJAO CARIOCA 1KG', '2', 849n],
      ['LEITE INTEGRAL 1L', '6', 479n],
    ]);
    expect(await prisma.transacao.count({ where: { usuarioId: usuario.usuarioId } })).toBe(0);
    expect(
      await prisma.importacaoDocumento.findFirstOrThrow({
        where: { usuarioId: usuario.usuarioId },
        select: { tipo: true, arquivoId: true, status: true },
      }),
    ).toEqual({ tipo: 'nfce', arquivoId: null, status: 'aguardando_confirmacao' });
    expect(
      await prisma.mensagem.findMany({
        where: { usuarioId: usuario.usuarioId },
        orderBy: { criadoEm: 'asc' },
        select: { autor: true, conteudo: true },
      }),
    ).toEqual([
      { autor: 'usuario', conteudo: MENSAGEM_QR_ENVIADO },
      { autor: 'mony', conteudo: lida.texto },
    ]);

    // Ler o mesmo QR de novo mostra o mesmo cartão, sem consultar de novo.
    const repetida = await lerQr(usuario, qr(chave));
    expect(repetida.componente).toEqual(lida.componente);
    expect(provedor.consultas).toHaveLength(1);

    // [Confirmar]: falta a categoria (RN-080), a forma veio do cupom.
    const pergunta = await tocar(usuario, opcao(lida.componente, 'confirmar'));
    expect(pergunta.componente?.tipo).toBe('botoes');
    const [primeiraCategoria] = pergunta.componente?.opcoes ?? [];
    const gravada = await tocar(usuario, primeiraCategoria);
    expect(gravada.transacaoId).not.toBeNull();
    const transacao = await prisma.transacao.findUniqueOrThrow({
      where: { id: gravada.transacaoId ?? '' },
      select: {
        descricao: true,
        valor: true,
        formaPagamento: true,
        origem: true,
        nfceNotaId: true,
        data: true,
      },
    });
    expect(transacao).toMatchObject({
      descricao: 'MERCADO EXEMPLO',
      valor: 7062n,
      formaPagamento: 'debito',
      origem: 'foto',
      nfceNotaId: nota?.id,
    });
    expect((await notasDo(usuario.usuarioId))[0]?.transacaoId).toBe(gravada.transacaoId);

    // Já lançado: o QR de novo só avisa.
    expect(await lerQr(usuario, qr(chave))).toEqual({
      texto: MENSAGEM_JA_LANCADO,
      componente: null,
      transacaoId: null,
    });
    expect(provedor.consultas).toHaveLength(1);
  });

  it('QR que não é cupom, ilegível ou de homologação: nem consulta nem conta', async () => {
    const usuario = await usuarioNovo();
    const chave = novaChave();
    const estragada = `${chave.slice(0, 43)}${String((Number(chave[43]) + 1) % 10)}`;

    expect((await lerQr(usuario, 'https://exemplo.com.br/promocao')).texto).toBe(
      MENSAGEM_NAO_E_CUPOM,
    );
    expect((await lerQr(usuario, qr(estragada))).texto).toBe(MENSAGEM_QR_ILEGIVEL);
    expect((await lerQr(usuario, qr(chave, 2))).texto).toBe(MENSAGEM_HOMOLOGACAO);
    expect(provedor.consultas).toEqual([]);
    expect(await usoDeLeitura(usuario.usuarioId)).toBe(0);
  });

  it('nota ainda fora da Sefaz: marca as novas tentativas e conta o resultado no chat', async () => {
    const usuario = await usuarioNovo();
    const chave = novaChave(9);
    provedor.programar(chave, new ErroNfce('sem dados', 'nao_encontrada'));

    const primeira = await lerQr(usuario, qr(chave));
    expect(primeira.texto).toBe(
      'Esse cupom foi emitido sem internet e ainda não chegou na Sefaz. Vou tentar de novo daqui a pouco e te aviso aqui.',
    );
    expect(primeira.componente).toBeNull();
    const [[nome, dados, opcoes]] = fila.add.mock.calls as unknown as [
      [string, DadosJobReconsulta, { delay: number; jobId: string }],
    ];
    expect(nome).toBe(JOB_RECONSULTA_NFCE);
    expect(dados).toEqual({ usuarioId: usuario.usuarioId, chave, uf: 'SP', tentativa: 1 });
    expect(opcoes.delay).toBe(ESPERAS_RECONSULTA_MS[0]);

    // Enquanto espera, ler de novo não consulta.
    expect((await lerQr(usuario, qr(chave))).texto).toBe(MENSAGEM_JA_AGUARDANDO);
    expect(provedor.consultas).toHaveLength(1);

    // A nova tentativa (no worker) acha a nota e manda a mensagem com o [Ver a compra].
    await consultas.reconsultar(dados);
    const mensagem = await prisma.mensagem.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId, autor: 'mony' },
      orderBy: { criadoEm: 'desc' },
      select: { conteudo: true, componentes: true },
    });
    expect(mensagem.conteudo).toBe(
      `Achei na Sefaz o cupom de MERCADO EXEMPLO: 3 itens, ${formatarCentavos(7062)}. Toque em Ver a compra para lançar.`,
    );
    const [botoes] = mensagem.componentes as ComponenteMony[];
    const compra = await tocar(usuario, opcao(botoes, 'ver-compra'));
    expect(compra.componente).toMatchObject({
      tipo: 'resumo',
      aConfirmar: true,
      lancamento: { descricao: 'MERCADO EXEMPLO', valorCentavos: 7062 },
    });

    // O botão com a nota de outra pessoa não acha nada.
    const outra = await usuarioNovo();
    const alheio = await chamar(outra, '/mony/acoes', { acao: opcao(botoes, 'ver-compra')?.acao });
    expect(alheio.statusCode).toBe(404);
  });

  it('a Sefaz fora do ar várias vezes: depois da última tentativa, a Mony pede a foto', async () => {
    const usuario = await usuarioNovo();
    const chave = novaChave();
    const fora = () => new ErroNfce('fora do ar', 'indisponivel');
    provedor.programar(chave, fora(), fora(), fora(), fora());

    expect((await lerQr(usuario, qr(chave))).texto).toBe(
      'A consulta da Sefaz não respondeu agora. Vou tentar de novo daqui a pouco e te aviso aqui.',
    );
    for (let tentativa = 1; tentativa <= ESPERAS_RECONSULTA_MS.length; tentativa += 1) {
      await consultas.reconsultar({ usuarioId: usuario.usuarioId, chave, uf: 'SP', tentativa });
    }
    // 5 min, 1 h e 6 h; a terceira nova tentativa é a última.
    expect(fila.add.mock.calls.map((chamada) => (chamada[2] as { delay: number }).delay)).toEqual([
      ...ESPERAS_RECONSULTA_MS,
    ]);
    const mensagens = await prisma.mensagem.findMany({
      where: { usuarioId: usuario.usuarioId, autor: 'mony' },
      orderBy: { criadoEm: 'asc' },
      select: { conteudo: true },
    });
    expect(mensagens.at(-1)?.conteudo).toBe(MENSAGEM_DESISTIU);
    expect(await notasDo(usuario.usuarioId)).toEqual([]);
  });

  it('recusa da consulta pede a foto; cupom cancelado avisa', async () => {
    const usuario = await usuarioNovo();
    const recusada = novaChave();
    const cancelada = novaChave();
    provedor.programar(recusada, new ErroNfce('UF sem cobertura', 'recusada'));
    provedor.programar(cancelada, { ...cupomDeExemplo(cancelada), cancelada: true });

    expect((await lerQr(usuario, qr(recusada))).texto).toBe(MENSAGEM_PEDIR_FOTO);
    expect((await lerQr(usuario, qr(cancelada))).texto).toBe(MENSAGEM_CANCELADA);
    expect(fila.add).not.toHaveBeenCalled();
    expect(await notasDo(usuario.usuarioId)).toEqual([]);
  });

  it('RN-120 RN-123 no gratuito, a consulta conta como leitura de documento', async () => {
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
    await prisma.usoRecurso.create({
      data: {
        usuarioId: usuario.usuarioId,
        recurso: 'leitura_documento',
        data: new Date('2026-10-01T00:00:00Z'),
        quantidade: 3,
      },
    });

    expect(await lerQr(usuario, qr(novaChave()))).toEqual({
      texto:
        'Você chegou ao limite de 3 leituras de foto, PDF ou cupom por mês do plano gratuito. No mês que vem libera de novo.',
      componente: botaoVerPlanos(),
      transacaoId: null,
    });
    expect(provedor.consultas).toEqual([]);
  });

  it('RN-120 no gratuito, só a consulta conta: QR inválido e cupom já lido não contam', async () => {
    const usuario = await usuarioNovo();
    await prisma.assinatura.update({
      where: { usuarioId: usuario.usuarioId },
      data: { plano: 'gratuito', testeInicio: null, testeFim: null },
    });
    const chave = novaChave();
    await lerQr(usuario, qr(chave));
    await lerQr(usuario, qr(chave));
    await lerQr(usuario, 'não é QR');
    expect(await usoDeLeitura(usuario.usuarioId)).toBe(1);
  });
});
