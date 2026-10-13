/**
 * Consulta do cupom fiscal (T-066a): a leitura da resposta da Infosimples, a chamada HTTP, o
 * provedor falso e as contas do cupom (data da compra, forma de pagamento).
 */
import { describe, expect, it, vi } from 'vitest';

import { validarAmbiente } from '../src/core/config/ambiente';
import { NfceFake, cupomDeExemplo } from '../src/integracoes/nfce/nfce-fake';
import {
  centavosDoValor,
  emissaoDoTexto,
  lerRespostaInfosimples,
  NfceInfosimples,
  quantidadeDoValor,
  URL_INFOSIMPLES_NFCE,
} from '../src/integracoes/nfce/nfce-infosimples';
import { ErroNfce } from '../src/integracoes/nfce/nfce.provider';
import {
  botaoVerCompra,
  formaDoCupom,
  instanteDaEmissao,
  notaDoCupom,
} from '../src/modulos/mony/consultas-nfce.service';

const CHAVE = '35261012345678000195650010001234561123456780';

/** A resposta da consulta com os campos da página da Infosimples. */
function respostaInfosimples(nota: Record<string, unknown> = {}, extra: object = {}) {
  return {
    code: 200,
    code_message: 'A requisição foi processada com sucesso.',
    header: { service: 'sefaz/nfce', price: '0.2' },
    data_count: 1,
    data: [
      {
        cancelada: false,
        emitente: { nome_razao_social: 'SUPERMERCADO BOM PRECO LTDA', cnpj: '12.345.678/0001-95' },
        informacoes_nota: {
          chave_acesso: CHAVE,
          data_emissao: '13/10/2026',
          hora_emissao: '18:32:05',
        },
        produtos: [
          {
            nome: 'ARROZ  TIPO 1 5KG',
            quantidade: '1,000',
            normalizado_quantidade: 1,
            unidade: 'UN',
            valor_unitario: '24,90',
            normalizado_valor_unitario: 24.9,
            valor_total_produto: '24,90',
            normalizado_valor_total_produto: 24.9,
          },
          {
            nome: 'TOMATE KG',
            quantidade: '0,735',
            unidade: 'KG',
            valor_unitario: '6,989',
            valor_total_produto: '5,14',
          },
        ],
        formas_pagamento: [
          {
            forma_pagamento: 'Cartão de Crédito',
            valor_pago: '30,04',
            normalizado_valor_pago: 30.04,
          },
        ],
        valor_total: '30,04',
        normalizado_valor_total: 30.04,
        valor_desconto: '0,00',
        valor_a_pagar: '30,04',
        normalizado_valor_a_pagar: 30.04,
        ...nota,
      },
    ],
    errors: [],
    ...extra,
  };
}

function erroDe(funcao: () => unknown): ErroNfce {
  try {
    funcao();
  } catch (erro) {
    if (erro instanceof ErroNfce) return erro;
    throw erro;
  }
  throw new Error('não deu erro');
}

describe('valores da Infosimples', () => {
  it('centavos de número e de texto em pt-BR, sem ponto flutuante', () => {
    expect(centavosDoValor(30.04)).toBe(3004);
    expect(centavosDoValor(45.9)).toBe(4590);
    expect(centavosDoValor(0.1 + 0.2)).toBe(30);
    expect(centavosDoValor(1_234_567.89)).toBe(123_456_789);
    expect(centavosDoValor('R$ 1.234,56')).toBe(123_456);
    expect(centavosDoValor('45,9')).toBe(4590);
    // Preço por quilo com 3 casas arredonda o centavo.
    expect(centavosDoValor('6,989')).toBe(699);
    expect(centavosDoValor('6,984')).toBe(698);
    expect(centavosDoValor('12.50')).toBe(1250);
    expect(centavosDoValor('abc')).toBeNull();
    expect(centavosDoValor(undefined)).toBeNull();
  });

  it('quantidade com até 4 casas; sem quantidade, 1', () => {
    expect(quantidadeDoValor(0.735)).toBe('0.7350');
    expect(quantidadeDoValor('0,735')).toBe('0.7350');
    expect(quantidadeDoValor('2')).toBe('2.0000');
    expect(quantidadeDoValor(undefined)).toBe('1');
    expect(quantidadeDoValor('')).toBe('1');
    expect(quantidadeDoValor(0)).toBe('1');
  });

  it('data e hora de emissão em formatos diferentes', () => {
    expect(emissaoDoTexto('13/10/2026', '18:32:05')).toEqual({
      data: '2026-10-13',
      hora: '18:32:05',
    });
    expect(emissaoDoTexto('13/10/2026 18:32', undefined)).toEqual({
      data: '2026-10-13',
      hora: '18:32:00',
    });
    expect(emissaoDoTexto('2026-10-13', undefined)).toEqual({ data: '2026-10-13', hora: null });
    expect(emissaoDoTexto('31/02/2026', undefined)).toBeNull();
    expect(emissaoDoTexto(undefined, '10:00')).toBeNull();
  });
});

describe('lerRespostaInfosimples', () => {
  it('lê emitente, itens, pagamentos, total e data', () => {
    expect(lerRespostaInfosimples(respostaInfosimples(), CHAVE)).toEqual({
      chave: CHAVE,
      emitente: { nome: 'SUPERMERCADO BOM PRECO LTDA', cnpj: '12345678000195' },
      emissao: { data: '2026-10-13', hora: '18:32:05' },
      totalCentavos: 3004,
      itens: [
        {
          descricao: 'ARROZ TIPO 1 5KG',
          quantidade: '1.0000',
          unidade: 'UN',
          valorUnitarioCentavos: 2490,
          valorTotalCentavos: 2490,
        },
        {
          descricao: 'TOMATE KG',
          quantidade: '0.7350',
          unidade: 'KG',
          valorUnitarioCentavos: 699,
          valorTotalCentavos: 514,
        },
      ],
      pagamentos: [{ descricao: 'Cartão de Crédito', valorCentavos: 3004 }],
      cancelada: false,
    });
  });

  it('o total é o que foi pago (com desconto); sem total, a soma dos itens', () => {
    const comDesconto = respostaInfosimples({
      normalizado_valor_a_pagar: 28,
      valor_a_pagar: '28,00',
    });
    expect(lerRespostaInfosimples(comDesconto, CHAVE).totalCentavos).toBe(2800);
    const semTotal = respostaInfosimples({
      valor_total: undefined,
      normalizado_valor_total: undefined,
      valor_a_pagar: undefined,
      normalizado_valor_a_pagar: undefined,
    });
    expect(lerRespostaInfosimples(semTotal, CHAVE).totalCentavos).toBe(2490 + 514);
  });

  it('nota cancelada, CNPJ fora do formato e produto sem nome ou valor', () => {
    const lida = lerRespostaInfosimples(
      respostaInfosimples({
        cancelada: 'Sim',
        emitente: { nome_razao_social: 'X', cnpj: '123' },
        produtos: [{ nome: '', valor_total_produto: '1,00' }, { nome: 'SEM VALOR' }],
      }),
      CHAVE,
    );
    expect(lida.cancelada).toBe(true);
    // CNPJ que não veio inteiro sai da chave.
    expect(lida.emitente.cnpj).toBe(CHAVE.slice(6, 20));
    expect(lida.itens).toEqual([]);
  });

  it('nota ainda não encontrada, falha que passa, problema da conta e recusa', () => {
    expect(
      erroDe(() => lerRespostaInfosimples({ code: 612, code_message: 'Sem dados' }, CHAVE)).motivo,
    ).toBe('nao_encontrada');
    for (const code of [600, 605, 609, 615, 618, 601, 603]) {
      expect(erroDe(() => lerRespostaInfosimples({ code }, CHAVE)).motivo).toBe('indisponivel');
    }
    for (const code of [604, 606, 608, 619]) {
      expect(erroDe(() => lerRespostaInfosimples({ code }, CHAVE)).motivo).toBe('recusada');
    }
    expect(erroDe(() => lerRespostaInfosimples({ code: 200, data: [] }, CHAVE)).motivo).toBe(
      'nao_encontrada',
    );
    expect(erroDe(() => lerRespostaInfosimples('<html>', CHAVE)).motivo).toBe('indisponivel');
    expect(
      erroDe(() =>
        lerRespostaInfosimples(
          respostaInfosimples({ informacoes_nota: { data_emissao: 'ontem' } }),
          CHAVE,
        ),
      ).motivo,
    ).toBe('recusada');
  });

  it('aceita `data` como objeto em vez de lista', () => {
    const { data } = respostaInfosimples();
    expect(lerRespostaInfosimples({ code: 200, data: data[0] }, CHAVE).totalCentavos).toBe(3004);
  });
});

describe('NfceInfosimples', () => {
  it('manda só o token e a chave, por POST', async () => {
    const buscar = vi.fn<(url: string, opcoes: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify(respostaInfosimples()), { status: 200 })),
    );
    const provedor = new NfceInfosimples('token-secreto', buscar);
    const cupom = await provedor.consultar(CHAVE);
    expect(cupom.totalCentavos).toBe(3004);
    const [url, opcoes] = buscar.mock.calls[0] ?? [];
    expect(url).toBe(URL_INFOSIMPLES_NFCE);
    expect(opcoes?.method).toBe('POST');
    const corpo = new URLSearchParams(typeof opcoes?.body === 'string' ? opcoes.body : '');
    expect(Object.fromEntries(corpo)).toEqual({
      token: 'token-secreto',
      nfce: CHAVE,
      timeout: '60',
    });
  });

  it('HTTP 429 e 5xx e falha de rede passam; outro 4xx é recusa', async () => {
    const resposta = (status: number) => () => Promise.resolve(new Response('{}', { status }));
    await expect(new NfceInfosimples('t', resposta(429)).consultar(CHAVE)).rejects.toMatchObject({
      motivo: 'indisponivel',
    });
    await expect(new NfceInfosimples('t', resposta(502)).consultar(CHAVE)).rejects.toMatchObject({
      motivo: 'indisponivel',
    });
    await expect(new NfceInfosimples('t', resposta(400)).consultar(CHAVE)).rejects.toMatchObject({
      motivo: 'recusada',
    });
    const semRede = () => Promise.reject(new TypeError('fetch failed'));
    await expect(new NfceInfosimples('t', semRede).consultar(CHAVE)).rejects.toMatchObject({
      motivo: 'indisponivel',
    });
  });
});

describe('NfceFake', () => {
  it('devolve o mercado de exemplo e as respostas programadas, uma por consulta', async () => {
    const fake = new NfceFake();
    expect(await fake.consultar(CHAVE)).toEqual(cupomDeExemplo(CHAVE));
    fake.programar(CHAVE, new ErroNfce('ainda não', 'nao_encontrada'));
    await expect(fake.consultar(CHAVE)).rejects.toMatchObject({ motivo: 'nao_encontrada' });
    expect(await fake.consultar(CHAVE)).toEqual(cupomDeExemplo(CHAVE));
    expect(fake.consultas).toEqual([CHAVE, CHAVE, CHAVE]);
  });

  it('o exemplo fecha: soma dos itens = total, e a data é do mês da chave', () => {
    const cupom = cupomDeExemplo(CHAVE);
    expect(cupom.itens.reduce((soma, item) => soma + item.valorTotalCentavos, 0)).toBe(
      cupom.totalCentavos,
    );
    expect(cupom.emissao.data).toBe('2026-10-10');
  });
});

describe('cupom para a nota', () => {
  it('a compra no relógio da loja, no fuso do usuário; sem hora, meio-dia', () => {
    expect(
      instanteDaEmissao(
        { data: '2026-10-13', hora: '18:32:05' },
        'America/Sao_Paulo',
      ).toISOString(),
    ).toBe('2026-10-13T21:32:05.000Z');
    expect(
      instanteDaEmissao({ data: '2026-10-13', hora: '18:32:05' }, 'America/Manaus').toISOString(),
    ).toBe('2026-10-13T22:32:05.000Z');
    expect(
      instanteDaEmissao({ data: '2026-10-13', hora: null }, 'America/Sao_Paulo').toISOString(),
    ).toBe('2026-10-13T15:00:00.000Z');
  });

  it('uma forma de pagamento só vale; formas diferentes ficam para a Mony perguntar', () => {
    expect(formaDoCupom([{ descricao: 'Cartão de Débito', valorCentavos: 100 }])).toBe('debito');
    expect(
      formaDoCupom([
        { descricao: 'PIX', valorCentavos: 50 },
        { descricao: 'Pagamento Instantâneo (PIX)', valorCentavos: 50 },
      ]),
    ).toBe('pix');
    expect(
      formaDoCupom([
        { descricao: 'Dinheiro', valorCentavos: 50 },
        { descricao: 'Cartão de Crédito', valorCentavos: 50 },
      ]),
    ).toBeNull();
    expect(formaDoCupom([])).toBeNull();
    expect(formaDoCupom([{ descricao: 'Vale Alimentação', valorCentavos: 1 }])).toBeNull();
  });

  it('a nota leva a UF da chave, a forma e os itens', () => {
    const nota = notaDoCupom(cupomDeExemplo(CHAVE), 'SP', 'America/Sao_Paulo');
    expect(nota).toMatchObject({
      chaveAcesso: CHAVE,
      emitente: 'MERCADO EXEMPLO LTDA',
      cnpj: '12345678000195',
      totalCentavos: 7062,
      uf: 'SP',
      formaPagamento: 'debito',
    });
    expect(nota.itens).toHaveLength(3);
    expect(nota.data.toISOString()).toBe('2026-10-10T21:32:05.000Z');
  });

  it('o botão [Ver a compra] leva a nota', () => {
    expect(botaoVerCompra('0199a000-0000-7000-8000-000000000001')).toEqual({
      tipo: 'botoes',
      opcoes: [
        {
          id: 'ver-compra',
          rotulo: 'Ver a compra',
          acao: { tipo: 'importar_nfce', notaId: '0199a000-0000-7000-8000-000000000001' },
        },
      ],
    });
  });
});

describe('ambiente da NFC-e', () => {
  const base = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('fake é o padrão; a Infosimples exige o token', () => {
    expect(validarAmbiente(base).NFCE_PROVEDOR).toBe('fake');
    expect(() => validarAmbiente({ ...base, NFCE_PROVEDOR: 'infosimples' })).toThrow(
      /INFOSIMPLES_TOKEN/,
    );
    expect(
      validarAmbiente({ ...base, NFCE_PROVEDOR: 'infosimples', INFOSIMPLES_TOKEN: 'abc' })
        .INFOSIMPLES_TOKEN,
    ).toBe('abc');
  });
});
