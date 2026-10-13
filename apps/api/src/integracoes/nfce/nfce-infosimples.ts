import { type DataCalendario, ehDataCalendario } from '@mony/shared/datas';
import { z } from 'zod';

import type { Buscar } from '../ia/llm-anthropic';
import {
  type CupomConsultado,
  ErroNfce,
  type ItemCupom,
  NfceProvider,
  type PagamentoCupom,
} from './nfce.provider';

/**
 * "SEFAZ / NFC-e (Unificada)" da Infosimples (docs/agentes/poc/T-026.md). Os campos da resposta
 * seguem a página pública da consulta; o envelope (`code`, `data`) e os códigos de erro seguem o
 * padrão da API v2 deles e precisam ser conferidos com a conta de teste e cupons reais (BLOQUEIOS).
 */
export const URL_INFOSIMPLES_NFCE = 'https://api.infosimples.com/api/v2/consultas/sefaz/nfce';

/** Segundos que a Infosimples pode esperar a Sefaz antes de desistir. */
const TEMPO_LIMITE_INFOSIMPLES_S = 60;

/** A consulta não achou a nota na Sefaz (ainda). */
const CODIGO_SEM_DADOS = 612;
/** Falhas que passam: erro inesperado, tempo esgotado, site da Sefaz fora, excesso de consultas. */
const CODIGOS_TRANSITORIOS = new Set([600, 605, 609, 610, 613, 614, 615, 617, 618]);
/** Token, serviço ou créditos: problema da conta, que alguém precisa resolver. */
const CODIGOS_DA_CONTA = new Set([601, 602, 603]);

const textoOuNumero = z.union([z.string(), z.number()]);

const esquemaProduto = z.looseObject({
  nome: z.string().optional(),
  quantidade: textoOuNumero.optional(),
  normalizado_quantidade: z.number().optional(),
  unidade: z.string().optional(),
  valor_unitario: textoOuNumero.optional(),
  normalizado_valor_unitario: z.number().optional(),
  valor_total_produto: textoOuNumero.optional(),
  normalizado_valor_total_produto: z.number().optional(),
});

const esquemaNota = z.looseObject({
  cancelada: z.union([z.boolean(), z.string()]).optional(),
  emitente: z
    .looseObject({ nome_razao_social: z.string().optional(), cnpj: z.string().optional() })
    .optional(),
  informacoes_nota: z
    .looseObject({
      chave_acesso: z.string().optional(),
      data_emissao: z.string().optional(),
      hora_emissao: z.string().optional(),
    })
    .optional(),
  produtos: z.array(esquemaProduto).optional(),
  formas_pagamento: z
    .array(
      z.looseObject({
        forma_pagamento: z.string().optional(),
        valor_pago: textoOuNumero.optional(),
        normalizado_valor_pago: z.number().optional(),
      }),
    )
    .optional(),
  valor_total: textoOuNumero.optional(),
  normalizado_valor_total: z.number().optional(),
  valor_a_pagar: textoOuNumero.optional(),
  normalizado_valor_a_pagar: z.number().optional(),
});

const esquemaEnvelope = z.looseObject({
  code: z.number(),
  code_message: z.string().optional(),
  data: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
  errors: z.array(z.unknown()).optional(),
});

/**
 * Centavos de um número decimal sem multiplicar em ponto flutuante: `45.9` → `"45.90"` → 4590.
 * Valores com mais casas (preço por quilo) são arredondados ao centavo.
 */
export function centavosDoNumero(valor: number): number | null {
  if (!Number.isFinite(valor)) return null;
  return centavosDoTextoDecimal(valor.toFixed(2));
}

/** `"1234.56"` ou `"-3.5"` → centavos, só com aritmética inteira. */
function centavosDoTextoDecimal(texto: string): number | null {
  const partes = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto);
  if (!partes) return null;
  const [, sinal = '', inteiro = '0', fracao = ''] = partes;
  const centavos = Number(inteiro) * 100 + Number(`${fracao}00`.slice(0, 2));
  // A terceira casa arredonda o centavo (preço por quilo com 3 casas).
  const arredonda = Number(fracao[2] ?? '0') >= 5 ? 1 : 0;
  return (sinal === '-' ? -1 : 1) * (centavos + arredonda);
}

/**
 * Centavos do valor como a consulta escreve: número (`normalizado_*`) ou texto em pt-BR
 * ("R$ 1.234,56", "45,9", "4,789").
 */
export function centavosDoValor(valor: string | number | undefined): number | null {
  if (valor === undefined) return null;
  if (typeof valor === 'number') return centavosDoNumero(valor);
  const limpo = valor.replace(/[^\d,.-]/g, '');
  const decimal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  return centavosDoTextoDecimal(decimal);
}

/** Quantidade como texto decimal com até 4 casas (coluna `numeric(12,4)`). */
export function quantidadeDoValor(valor: string | number | undefined): string {
  if (valor === undefined) return '1';
  if (typeof valor === 'number')
    return Number.isFinite(valor) && valor > 0 ? valor.toFixed(4) : '1';
  const limpo = valor.replace(/[^\d,.]/g, '');
  const decimal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const numero = Number(decimal);
  return decimal !== '' && Number.isFinite(numero) && numero > 0 ? numero.toFixed(4) : '1';
}

/** "13/10/2026", "2026-10-13" ou "13/10/2026 14:03:22" → data e hora (se houver). */
export function emissaoDoTexto(
  data: string | undefined,
  hora: string | undefined,
): { data: DataCalendario; hora: string | null } | null {
  if (data === undefined) return null;
  const [dia, horaJunto] = data.trim().split(/\s+/);
  let calendario: string | null = null;
  const brasileiro = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dia ?? '');
  if (brasileiro)
    calendario = `${brasileiro[3] ?? ''}-${brasileiro[2] ?? ''}-${brasileiro[1] ?? ''}`;
  else if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) calendario = dia;
  if (calendario === null || !ehDataCalendario(calendario)) return null;
  const textoHora = (hora ?? horaJunto ?? '').trim();
  const relogio = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(textoHora);
  return {
    data: calendario,
    hora: relogio ? `${relogio[1] ?? '00'}:${relogio[2] ?? '00'}:${relogio[3] ?? '00'}` : null,
  };
}

function primeiraNota(dados: unknown): unknown {
  return Array.isArray(dados) ? dados[0] : dados;
}

/**
 * Lê a resposta da Infosimples: o cupom (código 200) ou o erro com o motivo (nota ainda não na
 * Sefaz, falha que passa, ou recusa).
 */
export function lerRespostaInfosimples(json: unknown, chave: string): CupomConsultado {
  const envelope = esquemaEnvelope.safeParse(json);
  if (!envelope.success) {
    throw new ErroNfce('A Infosimples respondeu num formato desconhecido.', 'indisponivel');
  }
  const { code, code_message: mensagem = '' } = envelope.data;
  if (code === CODIGO_SEM_DADOS) {
    throw new ErroNfce(`Nota não encontrada na Sefaz (${mensagem}).`, 'nao_encontrada');
  }
  if (CODIGOS_TRANSITORIOS.has(code) || CODIGOS_DA_CONTA.has(code)) {
    throw new ErroNfce(`A Infosimples respondeu ${String(code)}: ${mensagem}`, 'indisponivel');
  }
  if (code !== 200) {
    throw new ErroNfce(
      `A Infosimples recusou a consulta (${String(code)}): ${mensagem}`,
      'recusada',
    );
  }
  const bruta = primeiraNota(envelope.data.data);
  if (bruta === undefined) {
    throw new ErroNfce('A Infosimples respondeu sem a nota.', 'nao_encontrada');
  }
  const nota = esquemaNota.safeParse(bruta);
  if (!nota.success) {
    throw new ErroNfce('A nota veio num formato desconhecido.', 'recusada');
  }
  const lida = nota.data;
  const itens: ItemCupom[] = (lida.produtos ?? []).flatMap((produto) => {
    const valorTotal =
      centavosDoValor(produto.normalizado_valor_total_produto ?? produto.valor_total_produto) ??
      null;
    const valorUnitario =
      centavosDoValor(produto.normalizado_valor_unitario ?? produto.valor_unitario) ?? valorTotal;
    const descricao = produto.nome?.replace(/\s+/g, ' ').trim() ?? '';
    if (descricao === '' || valorTotal === null || valorUnitario === null) return [];
    return [
      {
        descricao,
        quantidade: quantidadeDoValor(produto.normalizado_quantidade ?? produto.quantidade),
        unidade: produto.unidade?.trim() || 'UN',
        valorUnitarioCentavos: valorUnitario,
        valorTotalCentavos: valorTotal,
      },
    ];
  });
  const pagamentos: PagamentoCupom[] = (lida.formas_pagamento ?? []).flatMap((forma) => {
    const valor = centavosDoValor(forma.normalizado_valor_pago ?? forma.valor_pago);
    const descricao = forma.forma_pagamento?.trim() ?? '';
    return descricao === '' || valor === null ? [] : [{ descricao, valorCentavos: valor }];
  });
  const total =
    centavosDoValor(lida.normalizado_valor_a_pagar ?? lida.valor_a_pagar) ??
    centavosDoValor(lida.normalizado_valor_total ?? lida.valor_total) ??
    itens.reduce((soma, item) => soma + item.valorTotalCentavos, 0);
  const emissao = emissaoDoTexto(
    lida.informacoes_nota?.data_emissao,
    lida.informacoes_nota?.hora_emissao,
  );
  if (emissao === null || total <= 0) {
    throw new ErroNfce('A nota veio sem data de emissão ou sem valor.', 'recusada');
  }
  const cnpj = (lida.emitente?.cnpj ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return {
    chave,
    emitente: {
      nome: lida.emitente?.nome_razao_social?.trim() || 'Estabelecimento',
      cnpj: cnpj.length === 14 ? cnpj : chave.slice(6, 20),
    },
    emissao,
    totalCentavos: total,
    itens,
    pagamentos,
    cancelada:
      lida.cancelada === true ||
      (typeof lida.cancelada === 'string' && /^(sim|true|s)$/i.test(lida.cancelada.trim())),
  };
}

/**
 * A consulta pela chave (POST com o token no corpo, como pede a API v2 da Infosimples). 429, 5xx
 * e falha de rede são transitórios.
 */
export class NfceInfosimples extends NfceProvider {
  readonly nome = 'infosimples';

  constructor(
    private readonly token: string,
    private readonly buscar: Buscar = fetch,
  ) {
    super();
  }

  async consultar(chave: string, sinal?: AbortSignal): Promise<CupomConsultado> {
    let resposta: Response;
    try {
      resposta = await this.buscar(URL_INFOSIMPLES_NFCE, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: this.token,
          nfce: chave,
          timeout: String(TEMPO_LIMITE_INFOSIMPLES_S),
        }).toString(),
        ...(sinal ? { signal: sinal } : {}),
      });
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      throw new ErroNfce(`A Infosimples não respondeu: ${motivo}`, 'indisponivel');
    }
    if (!resposta.ok) {
      throw new ErroNfce(
        `A Infosimples respondeu HTTP ${String(resposta.status)}.`,
        resposta.status === 429 || resposta.status >= 500 ? 'indisponivel' : 'recusada',
      );
    }
    let corpo: unknown;
    try {
      corpo = await resposta.json();
    } catch {
      throw new ErroNfce('A Infosimples respondeu sem JSON.', 'indisponivel');
    }
    return lerRespostaInfosimples(corpo, chave);
  }
}
