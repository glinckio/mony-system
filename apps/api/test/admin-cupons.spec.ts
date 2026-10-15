import type Stripe from 'stripe';
import StripeSdk from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { ClockFixo } from '../src/core/clock/clock';
import { ErroDominio } from '../src/core/erros/erro-dominio';
import { CobrancaFake } from '../src/integracoes/cobranca/cobranca-fake';
import { criarCupomStripe, desativarCupomStripe } from '../src/integracoes/cobranca/cupons-stripe';
import type {
  AdminCuponsRepository,
  LinhaCupom,
} from '../src/modulos/admin/admin-cupons.repository';
import { AdminCuponsService } from '../src/modulos/admin/admin-cupons.service';

const ADMIN = '00000000-0000-4000-8000-000000000001';

/** Só as chamadas de cupom, gravando o que recebem. */
function stripeFalsa(codigo: () => Promise<unknown> = () => Promise.resolve({ id: 'promo_1' })) {
  const chamadas = {
    cupom: vi.fn<
      (dados: Stripe.CouponCreateParams, opcoes: Stripe.RequestOptions) => Promise<unknown>
    >(() => Promise.resolve({ id: 'cupom_1' })),
    codigo:
      vi.fn<
        (dados: Stripe.PromotionCodeCreateParams, opcoes: Stripe.RequestOptions) => Promise<unknown>
      >(codigo),
    apagado: vi.fn<(id: string) => Promise<unknown>>(() =>
      Promise.resolve({ id: 'cupom_1', deleted: true }),
    ),
  };
  const stripe = {
    coupons: { create: chamadas.cupom, del: chamadas.apagado },
    promotionCodes: { create: chamadas.codigo },
  } as unknown as Stripe;
  return { stripe, chamadas };
}

const erroStripe = (dados: { code?: string; param?: string }) =>
  new StripeSdk.errors.StripeInvalidRequestError({
    message: 'recusado',
    type: 'invalid_request_error',
    ...dados,
  });

describe('cupom do painel na Stripe (T-104d)', () => {
  it('RN-130 cria o desconto da primeira cobrança e o código promocional com a mesma validade', async () => {
    const { stripe, chamadas } = stripeFalsa();
    const id = await criarCupomStripe(stripe, {
      id: 'c1',
      codigo: 'BEMVINDO20',
      percentual: 20,
      expiraEm: new Date('2026-11-01T03:00:00Z'),
    });
    expect(id).toBe('cupom_1');
    expect(chamadas.cupom).toHaveBeenCalledWith(
      {
        name: 'BEMVINDO20',
        percent_off: 20,
        duration: 'once',
        redeem_by: 1_793_502_000,
        metadata: { cupomId: 'c1' },
      },
      { idempotencyKey: 'cupom-c1' },
    );
    expect(chamadas.codigo).toHaveBeenCalledWith(
      {
        promotion: { type: 'coupon', coupon: 'cupom_1' },
        code: 'BEMVINDO20',
        expires_at: 1_793_502_000,
        metadata: { cupomId: 'c1' },
      },
      { idempotencyKey: 'codigo-promocional-c1' },
    );
  });

  it('sem validade, não manda prazo à Stripe', async () => {
    const { stripe, chamadas } = stripeFalsa();
    await criarCupomStripe(stripe, {
      id: 'c2',
      codigo: 'SEMPRAZO',
      percentual: 10,
      expiraEm: null,
    });
    expect(chamadas.cupom.mock.calls[0]?.[0]).not.toHaveProperty('redeem_by');
    expect(chamadas.codigo.mock.calls[0]?.[0]).not.toHaveProperty('expires_at');
  });

  it('código que a Stripe já tem: apaga o cupom criado e responde conflito', async () => {
    const { stripe, chamadas } = stripeFalsa(() => Promise.reject(erroStripe({ param: 'code' })));
    await expect(
      criarCupomStripe(stripe, { id: 'c3', codigo: 'REPETIDO', percentual: 10, expiraEm: null }),
    ).rejects.toMatchObject({ codigo: 'CONFLITO' });
    expect(chamadas.apagado).toHaveBeenCalledWith('cupom_1');
  });

  it('desativar apaga o cupom; um que a Stripe já não tem conta como desativado', async () => {
    const { stripe, chamadas } = stripeFalsa();
    await desativarCupomStripe(stripe, 'cupom_1');
    expect(chamadas.apagado).toHaveBeenCalledWith('cupom_1');
    chamadas.apagado.mockRejectedValueOnce(erroStripe({ code: 'resource_missing' }));
    await expect(desativarCupomStripe(stripe, 'cupom_x')).resolves.toBeUndefined();
  });
});

/** O repositório em memória, com os mesmos passos do de verdade. */
function servico(agora = '2026-10-15T15:00:00Z') {
  const linhas = new Map<string, LinhaCupom & { stripeCouponId: string }>();
  const repositorio = {
    cupons: () => Promise.resolve([...linhas.values()]),
    cupom: (id: string) => Promise.resolve(linhas.get(id) ?? null),
    reservar: (dados: { codigo: string; percentual: number; validade: Date | null }) => {
      if ([...linhas.values()].some((linha) => linha.codigo === dados.codigo)) {
        return Promise.resolve(null);
      }
      const id = `id-${linhas.size + 1}`;
      linhas.set(id, {
        id,
        ...dados,
        ativo: false,
        stripeCouponId: 'pendente:x',
        criadoEm: new Date(agora),
        criadoPor: null,
      });
      return Promise.resolve(id);
    },
    soltar: (id: string) => Promise.resolve(void linhas.delete(id)),
    ativar: (dados: { id: string; stripeCouponId: string }) => {
      const linha = linhas.get(dados.id);
      if (linha) Object.assign(linha, { ativo: true, stripeCouponId: dados.stripeCouponId });
      return Promise.resolve();
    },
    desativar: (dados: { id: string }) => {
      const linha = linhas.get(dados.id);
      if (linha) linha.ativo = false;
      return Promise.resolve();
    },
  } as unknown as AdminCuponsRepository;
  const cobranca = new CobrancaFake(false);
  const relogio = new ClockFixo(agora);
  return {
    cupons: new AdminCuponsService(repositorio, cobranca, relogio),
    cobranca,
    relogio,
    linhas,
  };
}

describe('cupons no painel (T-104d)', () => {
  it('RN-130 grava o código em maiúsculas e vale até o fim do último dia em São Paulo', async () => {
    const { cupons, cobranca, linhas } = servico();
    const criado = await cupons.criar(
      ADMIN,
      { codigo: 'BemVindo20', percentual: 20, validade: '2026-10-31' },
      '10.0.0.1',
    );
    expect(criado).toMatchObject({
      codigo: 'BEMVINDO20',
      percentual: 20,
      validade: '2026-10-31',
      situacao: 'ativo',
    });
    expect(linhas.get(criado.id)?.validade?.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(cobranca.cupons.get('BEMVINDO20')).toBe(linhas.get(criado.id)?.stripeCouponId);
  });

  it('validade de hoje vale; de ontem é recusada', async () => {
    const { cupons } = servico('2026-10-15T15:00:00Z');
    await expect(
      cupons.criar(ADMIN, { codigo: 'HOJE', percentual: 5, validade: '2026-10-15' }, 'ip'),
    ).resolves.toMatchObject({ situacao: 'ativo', validade: '2026-10-15' });
    await expect(
      cupons.criar(ADMIN, { codigo: 'ONTEM', percentual: 5, validade: '2026-10-14' }, 'ip'),
    ).rejects.toMatchObject({ codigo: 'REQUISICAO_INVALIDA' });
  });

  it('passada a validade, o cupom aparece como vencido', async () => {
    const { cupons, relogio } = servico('2026-10-15T15:00:00Z');
    await cupons.criar(ADMIN, { codigo: 'CURTO', percentual: 5, validade: '2026-10-15' }, 'ip');
    relogio.avancar(12 * 60 * 60 * 1000);
    expect((await cupons.cupons())[0]?.situacao).toBe('vencido');
  });

  it('código repetido, mesmo em minúsculas, é conflito e não vai à Stripe', async () => {
    const { cupons, cobranca } = servico();
    await cupons.criar(ADMIN, { codigo: 'DUPLO', percentual: 5, validade: null }, 'ip');
    const criar = vi.spyOn(cobranca, 'criarCupom');
    await expect(
      cupons.criar(ADMIN, { codigo: 'duplo', percentual: 9, validade: null }, 'ip'),
    ).rejects.toMatchObject({ codigo: 'CONFLITO' });
    expect(criar).not.toHaveBeenCalled();
  });

  it('a Stripe falhou: o código fica livre de novo', async () => {
    const { cupons, cobranca, linhas } = servico();
    vi.spyOn(cobranca, 'criarCupom').mockRejectedValueOnce(new ErroDominio('SERVICO_INDISPONIVEL'));
    await expect(
      cupons.criar(ADMIN, { codigo: 'FALHOU', percentual: 5, validade: null }, 'ip'),
    ).rejects.toMatchObject({ codigo: 'SERVICO_INDISPONIVEL' });
    expect(linhas.size).toBe(0);
    await expect(
      cupons.criar(ADMIN, { codigo: 'FALHOU', percentual: 5, validade: null }, 'ip'),
    ).resolves.toMatchObject({ situacao: 'ativo' });
  });

  it('desativar tira o código da Stripe uma vez só', async () => {
    const { cupons, cobranca } = servico();
    const criado = await cupons.criar(
      ADMIN,
      { codigo: 'SAI', percentual: 5, validade: null },
      'ip',
    );
    const desativar = vi.spyOn(cobranca, 'desativarCupom');
    expect((await cupons.desativar(ADMIN, criado.id, 'ip')).situacao).toBe('desativado');
    expect((await cupons.desativar(ADMIN, criado.id, 'ip')).situacao).toBe('desativado');
    expect(desativar).toHaveBeenCalledTimes(1);
    expect(cobranca.cupons.has('SAI')).toBe(false);
  });
});
