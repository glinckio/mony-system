/**
 * Transações e anexos com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`).
 * O S3 é o armazenamento em memória: o teste faz o papel do app enviando o arquivo.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { dataNoFuso } from '@mony/shared/datas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import {
  ArmazenamentoArquivos,
  ArmazenamentoMemoria,
} from '../src/core/arquivos/armazenamento-arquivos';
import { criarClientePrisma } from '../src/core/prisma/cliente';

const ativo = process.env.TESTES_INTEGRACAO === '1';

interface Transacao {
  id: string;
  tipo: string;
  descricao: string;
  valorCentavos: number;
  data: string;
  status: string;
  formaPagamento: string | null;
  categoriaId: string;
  contaId: string | null;
  anexos: { id: string; tamanho: number }[];
}

interface Usuario {
  usuarioId: string;
  acesso: string;
  despesa: string;
  outraDespesa: string;
  receita: string;
}

describe.runIf(ativo)('integração: transações', () => {
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

  async function usuarioNovo(): Promise<Usuario> {
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
    const categorias = await prisma.categoria.findMany({
      where: { usuarioId: sessao.usuario.id },
      orderBy: { nome: 'asc' },
    });
    const de = (tipo: string) => categorias.filter((categoria) => categoria.tipo === tipo);
    return {
      usuarioId: sessao.usuario.id,
      acesso: sessao.tokens.acesso,
      despesa: de('despesa')[0]?.id ?? '',
      outraDespesa: de('despesa')[1]?.id ?? '',
      receita: de('receita')[0]?.id ?? '',
    };
  }

  function chamar(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    acesso: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${acesso}`, ...headers },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
  }

  async function lancar(usuario: Usuario, dados: Record<string, unknown>): Promise<Transacao> {
    const resposta = await chamar('POST', '/transacoes', usuario.acesso, dados, {
      'idempotency-key': randomUUID(),
    });
    expect(resposta.statusCode).toBe(201);
    return resposta.json<{ transacao: Transacao }>().transacao;
  }

  const despesa = (usuario: Usuario, extra: Record<string, unknown> = {}) =>
    lancar(usuario, {
      tipo: 'despesa',
      descricao: 'Mercado',
      valorCentavos: 15990,
      categoriaId: usuario.despesa,
      formaPagamento: 'pix',
      ...extra,
    });

  it('RN-040 a RN-042 grava com data de hoje no fuso do usuário e status padrão', async () => {
    const usuario = await usuarioNovo();
    const resposta = await chamar(
      'POST',
      '/transacoes',
      usuario.acesso,
      {
        tipo: 'despesa',
        descricao: '  Mercado da esquina ',
        valorCentavos: 15990,
        categoriaId: usuario.despesa,
        formaPagamento: 'pix',
      },
      { 'idempotency-key': randomUUID() },
    );
    expect(resposta.statusCode).toBe(201);
    const { transacao, impacto } = resposta.json<{ transacao: Transacao; impacto: object }>();
    expect(transacao).toMatchObject({
      descricao: 'Mercado da esquina',
      valorCentavos: 15990,
      data: dataNoFuso(new Date(), 'America/Sao_Paulo'),
      status: 'pago',
      origem: 'manual',
      natureza: 'normal',
    });
    expect(impacto).toEqual({});

    const boleto = await despesa(usuario, { formaPagamento: 'boleto' });
    expect(boleto.status).toBe('pendente');
    const futura = await despesa(usuario, { data: '2099-01-10' });
    expect(futura.status).toBe('pendente');

    // O primeiro lançamento marca a etapa do onboarding (RN-024).
    const onboarding = await chamar('GET', '/me/onboarding', usuario.acesso);
    expect(onboarding.json()).toMatchObject({
      etapas: expect.arrayContaining([
        expect.objectContaining({ etapa: 'primeiro-lancamento', situacao: 'concluida' }),
      ]) as unknown,
    });
  });

  it('doc 05: Idempotency-Key obrigatória; a mesma chave não grava duas vezes', async () => {
    const usuario = await usuarioNovo();
    const corpo = {
      tipo: 'receita',
      descricao: 'Salário',
      valorCentavos: 500000,
      categoriaId: usuario.receita,
    };
    expect((await chamar('POST', '/transacoes', usuario.acesso, corpo)).statusCode).toBe(400);
    const chave = randomUUID();
    const primeira = await chamar('POST', '/transacoes', usuario.acesso, corpo, {
      'idempotency-key': chave,
    });
    const segunda = await chamar('POST', '/transacoes', usuario.acesso, corpo, {
      'idempotency-key': chave,
    });
    expect(segunda.json()).toEqual(primeira.json());
    expect(await prisma.transacao.count({ where: { usuarioId: usuario.usuarioId } })).toBe(1);
  });

  it('categoria precisa ser do usuário e do mesmo tipo; compra no cartão precisa do cartão', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    const base = { tipo: 'despesa', descricao: 'X', valorCentavos: 100, formaPagamento: 'pix' };
    const cabecalho = () => ({ 'idempotency-key': randomUUID() });
    const casos = [
      [{ ...base, categoriaId: usuario.receita }, 400],
      [{ ...base, categoriaId: outro.despesa }, 404],
      [{ ...base, categoriaId: usuario.despesa, formaPagamento: 'cartao_credito' }, 400],
      [{ ...base, categoriaId: usuario.despesa, contaId: randomUUID() }, 404],
      [{ ...base, categoriaId: usuario.despesa, formaPagamento: undefined }, 400],
    ] as const;
    for (const [corpo, status] of casos) {
      expect(
        (await chamar('POST', '/transacoes', usuario.acesso, corpo, cabecalho())).statusCode,
      ).toBe(status);
    }
  });

  it('RN-047 lista por data, pagina por cursor e soma no servidor', async () => {
    const usuario = await usuarioNovo();
    await despesa(usuario, { data: '2026-09-30', valorCentavos: 1000, descricao: 'Padaria' });
    await despesa(usuario, { data: '2026-10-01', valorCentavos: 2000, formaPagamento: 'boleto' });
    await despesa(usuario, { data: '2026-10-05', valorCentavos: 3000, descricao: 'Uber centro' });
    await despesa(usuario, { data: '2026-10-05', valorCentavos: 4000, observacao: 'uber volta' });
    await lancar(usuario, {
      tipo: 'receita',
      descricao: 'Salário',
      valorCentavos: 100000,
      data: '2026-10-05',
      categoriaId: usuario.receita,
    });

    const pagina1 = (
      await chamar('GET', '/transacoes?de=2026-10-01&ate=2026-10-31&limite=2', usuario.acesso)
    ).json<{ itens: Transacao[]; proximoCursor: string | null }>();
    expect(pagina1.itens).toHaveLength(2);
    expect(pagina1.itens.every(({ data }) => data === '2026-10-05')).toBe(true);
    expect(pagina1.proximoCursor).not.toBeNull();
    const pagina2 = (
      await chamar(
        'GET',
        `/transacoes?de=2026-10-01&ate=2026-10-31&limite=2&cursor=${pagina1.proximoCursor ?? ''}`,
        usuario.acesso,
      )
    ).json<{ itens: Transacao[]; proximoCursor: string | null }>();
    expect(pagina2.itens.map(({ data }) => data)).toEqual(['2026-10-05', '2026-10-01']);
    expect(pagina2.proximoCursor).toBeNull();
    const ids = [...pagina1.itens, ...pagina2.itens].map(({ id }) => id);
    expect(new Set(ids).size).toBe(4);

    const busca = (await chamar('GET', '/transacoes?texto=UBER', usuario.acesso)).json<{
      itens: Transacao[];
    }>();
    expect(busca.itens.map(({ valorCentavos }) => valorCentavos).sort()).toEqual([3000, 4000]);

    const totais = await chamar(
      'GET',
      '/transacoes/totais?de=2026-10-01&ate=2026-10-31',
      usuario.acesso,
    );
    expect(totais.json()).toEqual({
      receitasCentavos: 100000,
      despesasCentavos: 9000,
      saldoCentavos: 91000,
      despesasPagasCentavos: 7000,
      despesasPendentesCentavos: 2000,
      quantidade: 4,
    });

    expect((await chamar('GET', '/transacoes?cursor=invalido', usuario.acesso)).statusCode).toBe(
      400,
    );
  });

  it('RN-037 pagamento de fatura e transferência não entram nas despesas', async () => {
    const usuario = await usuarioNovo();
    await despesa(usuario, { data: '2026-10-05', valorCentavos: 1000 });
    for (const natureza of ['pagamento_fatura', 'transferencia'] as const) {
      await prisma.transacao.create({
        data: {
          usuarioId: usuario.usuarioId,
          categoriaId: usuario.despesa,
          tipo: 'despesa',
          descricao: natureza,
          valor: 50000n,
          data: new Date('2026-10-05'),
          status: 'pago',
          natureza,
        },
      });
    }
    const totais = await chamar('GET', '/transacoes/totais?de=2026-10-01', usuario.acesso);
    expect(totais.json()).toMatchObject({ despesasCentavos: 1000, quantidade: 3 });
  });

  it('edita, exclui logicamente e não deixa mexer no que é de outro usuário', async () => {
    const usuario = await usuarioNovo();
    const transacao = await despesa(usuario);
    const editada = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      valorCentavos: 2500,
      categoriaId: usuario.outraDespesa,
      observacao: 'dividido',
    });
    expect(editada.json<{ transacao: Transacao }>().transacao).toMatchObject({
      valorCentavos: 2500,
      categoriaId: usuario.outraDespesa,
    });
    const limpa = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      observacao: null,
    });
    expect(limpa.json()).toMatchObject({ transacao: { observacao: null } });

    const outro = await usuarioNovo();
    expect((await chamar('GET', `/transacoes/${transacao.id}`, outro.acesso)).statusCode).toBe(404);
    expect((await chamar('DELETE', `/transacoes/${transacao.id}`, outro.acesso)).statusCode).toBe(
      404,
    );

    expect((await chamar('DELETE', `/transacoes/${transacao.id}`, usuario.acesso)).statusCode).toBe(
      204,
    );
    expect((await chamar('GET', `/transacoes/${transacao.id}`, usuario.acesso)).statusCode).toBe(
      404,
    );
    const noBanco = await prisma.transacao.findFirst({
      where: { id: transacao.id, excluidoEm: { not: null } },
    });
    expect(noBanco).not.toBeNull();
  });

  it('RN-045 do Open Finance só muda categoria, descrição, observação e anexos', async () => {
    const usuario = await usuarioNovo();
    const importada = await prisma.transacao.create({
      data: {
        usuarioId: usuario.usuarioId,
        categoriaId: usuario.despesa,
        tipo: 'despesa',
        descricao: 'PIX ENVIADO',
        valor: 5000n,
        data: new Date('2026-10-05'),
        status: 'pago',
        formaPagamento: 'pix',
        origem: 'open_finance',
        idExterno: randomUUID(),
      },
    });
    const valor = await chamar('PATCH', `/transacoes/${importada.id}`, usuario.acesso, {
      valorCentavos: 1,
    });
    expect(valor.statusCode).toBe(409);
    expect(valor.json()).toMatchObject({ erro: { codigo: 'TRANSACAO_OPEN_FINANCE_BLOQUEADA' } });
    const descricao = await chamar('PATCH', `/transacoes/${importada.id}`, usuario.acesso, {
      descricao: 'Aluguel',
      categoriaId: usuario.outraDespesa,
    });
    expect(descricao.statusCode).toBe(200);
  });

  it('RN-043 ocorrência de recorrência editada à mão fica marcada', async () => {
    const usuario = await usuarioNovo();
    const recorrencia = await prisma.recorrencia.create({
      data: {
        usuarioId: usuario.usuarioId,
        categoriaId: usuario.despesa,
        tipo: 'despesa',
        descricao: 'Academia',
        valor: 9990n,
        frequencia: 'mensal',
        dataInicio: new Date('2026-10-01'),
        proximaGeracao: new Date('2026-11-01'),
      },
    });
    const ocorrencia = await prisma.transacao.create({
      data: {
        usuarioId: usuario.usuarioId,
        categoriaId: usuario.despesa,
        recorrenciaId: recorrencia.id,
        tipo: 'despesa',
        descricao: 'Academia',
        valor: 9990n,
        data: new Date('2026-10-01'),
        status: 'pendente',
        formaPagamento: 'boleto',
      },
    });
    await chamar('PATCH', `/transacoes/${ocorrencia.id}`, usuario.acesso, { valorCentavos: 12000 });
    expect(
      (await prisma.transacao.findUniqueOrThrow({ where: { id: ocorrencia.id } }))
        .editadaManualmente,
    ).toBe(true);
  });

  it('RN-044 lote: muda a categoria ou exclui tudo, ou nada', async () => {
    const usuario = await usuarioNovo();
    const a = await despesa(usuario);
    const b = await despesa(usuario);
    const receita = await lancar(usuario, {
      tipo: 'receita',
      descricao: 'Pix recebido',
      valorCentavos: 1000,
      categoriaId: usuario.receita,
    });

    const misturado = await chamar('POST', '/transacoes/lote', usuario.acesso, {
      acao: 'mudar_categoria',
      ids: [a.id, receita.id],
      categoriaId: usuario.outraDespesa,
    });
    expect(misturado.statusCode).toBe(400);

    const mudou = await chamar('POST', '/transacoes/lote', usuario.acesso, {
      acao: 'mudar_categoria',
      ids: [a.id, b.id],
      categoriaId: usuario.outraDespesa,
    });
    expect(mudou.json()).toEqual({ afetadas: 2 });

    const comAlheia = await chamar('POST', '/transacoes/lote', usuario.acesso, {
      acao: 'excluir',
      ids: [a.id, randomUUID()],
    });
    expect(comAlheia.statusCode).toBe(404);
    expect(await prisma.transacao.count({ where: { id: a.id } })).toBe(1);

    const excluiu = await chamar('POST', '/transacoes/lote', usuario.acesso, {
      acao: 'excluir',
      ids: [a.id, b.id, receita.id],
    });
    expect(excluiu.json()).toEqual({ afetadas: 3 });
    expect(await prisma.transacao.count({ where: { usuarioId: usuario.usuarioId } })).toBe(0);
  });

  it('anexo: URL de envio, ligação depois do envio e URL de leitura', async () => {
    const usuario = await usuarioNovo();
    const preparo = await chamar('POST', '/arquivos', usuario.acesso, {
      tipo: 'comprovante',
      tipoConteudo: 'application/pdf',
      tamanho: 2048,
    });
    expect(preparo.statusCode).toBe(201);
    const envio = preparo.json<{ id: string; url: string; cabecalhos: Record<string, string> }>();
    expect(envio.cabecalhos).toEqual({ 'content-type': 'application/pdf' });
    const anexo = await prisma.anexo.findUniqueOrThrow({ where: { id: envio.id } });
    expect(anexo.arquivoUrl).toMatch(new RegExp(`^usuarios/${usuario.usuarioId}/anexos/.+\\.pdf$`));

    // Antes do envio, a ligação é recusada.
    const cedo = await chamar(
      'POST',
      '/transacoes',
      usuario.acesso,
      {
        tipo: 'despesa',
        descricao: 'Conta de luz',
        valorCentavos: 18000,
        categoriaId: usuario.despesa,
        formaPagamento: 'boleto',
        anexoIds: [envio.id],
      },
      { 'idempotency-key': randomUUID() },
    );
    expect(cedo.statusCode).toBe(400);

    armazenamento.simularEnvio(anexo.arquivoUrl, 1900, 'application/pdf');
    const transacao = await despesa(usuario, { anexoIds: [envio.id] });
    expect(transacao.anexos).toEqual([{ id: envio.id, tipo: 'comprovante', tamanho: 1900 }]);

    const leitura = await chamar('GET', `/arquivos/${envio.id}`, usuario.acesso);
    expect(leitura.json()).toMatchObject({ id: envio.id, tamanho: 1900 });

    // O mesmo anexo não vai para outro lançamento; tirar da lista solta o anexo.
    const outra = await despesa(usuario);
    const repetido = await chamar('PATCH', `/transacoes/${outra.id}`, usuario.acesso, {
      anexoIds: [envio.id],
    });
    expect(repetido.statusCode).toBe(409);
    const sem = await chamar('PATCH', `/transacoes/${transacao.id}`, usuario.acesso, {
      anexoIds: [],
    });
    expect(sem.json()).toMatchObject({ transacao: { anexos: [] } });

    const outro = await usuarioNovo();
    expect((await chamar('GET', `/arquivos/${envio.id}`, outro.acesso)).statusCode).toBe(404);
  });
});
