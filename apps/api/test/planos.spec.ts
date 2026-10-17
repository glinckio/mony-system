/**
 * Cotas do plano gratuito (T-100): as regras puras do plano que vale agora, do limite e da frase
 * da Mony. O caminho com o banco está em `planos.integracao.spec.ts`.
 */
import { describe, expect, it } from 'vitest';

import { ErroDominio } from '../src/core/erros/erro-dominio';
import {
  avisoDoLimite,
  botaoVerPlanos,
  ehVerPlanos,
  ID_VER_PLANOS,
} from '../src/modulos/mony/aviso-limite';
import {
  contaNaCota,
  ehErroDeLimite,
  ehLimitado,
  erroDeLimite,
  janelaDoMes,
  limiteEstourado,
  mensagemDoLimite,
  planoEfetivo,
  renovaEm,
} from '../src/modulos/planos/dominio/cotas';

const AGORA = new Date('2026-10-15T15:00:00Z');

describe('plano que vale agora (RN-120, RN-126)', () => {
  it('o teste vale até o fim; depois é o gratuito, mesmo antes da rotina diária', () => {
    const teste = { plano: 'teste' as const, status: 'ativa' as const, pagoAte: null };
    expect(planoEfetivo({ ...teste, testeFim: new Date('2026-10-16T00:00:00Z') }, AGORA)).toBe(
      'teste',
    );
    expect(planoEfetivo({ ...teste, testeFim: AGORA }, AGORA)).toBe('gratuito');
    expect(planoEfetivo({ ...teste, testeFim: null, pagoAte: null }, AGORA)).toBe('teste');
  });

  it('T-105 o anual pago com Pix vale até pagoAte e depois é o gratuito', () => {
    const pix = { plano: 'anual' as const, status: 'ativa' as const, testeFim: null };
    expect(planoEfetivo({ ...pix, pagoAte: new Date('2026-10-15T15:00:01Z') }, AGORA)).toBe(
      'anual',
    );
    expect(planoEfetivo({ ...pix, pagoAte: AGORA }, AGORA)).toBe('gratuito');
  });

  it('pago libera tudo, inclusive inadimplente (RN-131); cancelada e sem assinatura são o gratuito', () => {
    expect(
      planoEfetivo({ plano: 'mensal', status: 'ativa', testeFim: null, pagoAte: null }, AGORA),
    ).toBe('mensal');
    expect(
      planoEfetivo(
        { plano: 'anual', status: 'inadimplente', testeFim: null, pagoAte: null },
        AGORA,
      ),
    ).toBe('anual');
    expect(
      planoEfetivo({ plano: 'mensal', status: 'cancelada', testeFim: null, pagoAte: null }, AGORA),
    ).toBe('gratuito');
    expect(planoEfetivo(null, AGORA)).toBe('gratuito');
    expect(ehLimitado('gratuito')).toBe(true);
    expect(['teste', 'mensal', 'anual'].map((plano) => ehLimitado(plano as 'teste'))).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('RN-120 contam o app e a Mony; rotina, Open Finance e admin não', () => {
    expect(contaNaCota('app')).toBe(true);
    expect(contaNaCota('mony')).toBe(true);
    expect(contaNaCota('sistema')).toBe(false);
    expect(contaNaCota('open_finance')).toBe(false);
    expect(contaNaCota('admin')).toBe(false);
  });
});

describe('limite do dia e do mês (RN-120, RN-122)', () => {
  const lancamento = { limiteDia: 3, limiteMes: 30, limiteQuantidade: null };

  it('cabe até o limite; o do dia vem antes do do mês', () => {
    expect(limiteEstourado(lancamento, { dia: 2, mes: 20 })).toBeNull();
    expect(limiteEstourado(lancamento, { dia: 3, mes: 20 })).toEqual({ periodo: 'dia', limite: 3 });
    expect(limiteEstourado(lancamento, { dia: 3, mes: 30 })).toEqual({ periodo: 'dia', limite: 3 });
    expect(limiteEstourado(lancamento, { dia: 0, mes: 30 })).toEqual({
      periodo: 'mes',
      limite: 30,
    });
    expect(limiteEstourado(lancamento, { dia: 0, mes: 29 }, 2)).toEqual({
      periodo: 'mes',
      limite: 30,
    });
  });

  it('sem limite naquele período, não conta; uso acima do limite (o admin baixou) não cabe', () => {
    const leitura = { limiteDia: null, limiteMes: 3, limiteQuantidade: null };
    expect(limiteEstourado(leitura, { dia: 50, mes: 2 })).toBeNull();
    expect(limiteEstourado({ ...lancamento, limiteDia: 2 }, { dia: 3, mes: 3 })).toEqual({
      periodo: 'dia',
      limite: 2,
    });
  });

  it('RN-122 o mês vai do dia 1º a hoje; renova à meia-noite no fuso do usuário', () => {
    expect(janelaDoMes('2026-10-15')).toEqual({ inicio: '2026-10-01', fim: '2026-10-15' });
    expect(renovaEm('2026-10-15', 'dia', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-16T03:00:00.000Z',
    );
    expect(renovaEm('2026-10-15', 'mes', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-11-01T03:00:00.000Z',
    );
    expect(renovaEm('2026-12-31', 'dia', 'America/Manaus').toISOString()).toBe(
      '2027-01-01T04:00:00.000Z',
    );
  });
});

describe('aviso do limite (RN-123)', () => {
  it('a frase diz o que acabou e quando volta', () => {
    expect(mensagemDoLimite('lancamento', 'dia', 3)).toBe(
      'Você chegou ao limite de 3 lançamentos por dia do plano gratuito. Amanhã libera de novo.',
    );
    expect(mensagemDoLimite('leitura_documento', 'mes', 3)).toBe(
      'Você chegou ao limite de 3 leituras de foto, PDF ou cupom por mês do plano gratuito. No mês que vem libera de novo.',
    );
    expect(mensagemDoLimite('mensagem_mony', 'dia', 10)).toContain('10 mensagens para a Mony');
    expect(mensagemDoLimite('cartao', 'quantidade', 1)).toBe(
      'O plano gratuito permite 1 cartão. Para ter mais, conheça os planos.',
    );
    expect(mensagemDoLimite('relatorio', 'mes', 1)).toBe(
      'No plano gratuito, os relatórios mostram só o mês atual.',
    );
  });

  it('o erro LIMITE_PLANO_ATINGIDO leva os detalhes; a Mony responde com o [Ver planos]', () => {
    const erro = erroDeLimite({
      recurso: 'lancamento',
      periodo: 'dia',
      limite: 3,
      renovaEm: '2026-10-16T03:00:00.000Z',
    });
    expect(erro.codigo).toBe('LIMITE_PLANO_ATINGIDO');
    expect(erro.status).toBe(403);
    expect(erro.detalhes).toEqual({
      recurso: 'lancamento',
      periodo: 'dia',
      limite: 3,
      renovaEm: '2026-10-16T03:00:00.000Z',
    });
    expect(ehErroDeLimite(erro)).toBe(true);
    expect(ehErroDeLimite(new ErroDominio('CONFLITO'))).toBe(false);

    expect(avisoDoLimite(erro)).toEqual({
      texto: erro.message,
      componente: botaoVerPlanos(),
      transacaoId: null,
    });
    expect(avisoDoLimite(new Error('outro'))).toBeNull();
    expect(botaoVerPlanos()).toEqual({
      tipo: 'botoes',
      opcoes: [
        {
          id: ID_VER_PLANOS,
          rotulo: 'Ver planos',
          acao: { tipo: 'abrir', link: 'mony://planos' },
        },
      ],
    });
    expect(ehVerPlanos(botaoVerPlanos())).toBe(true);
    expect(
      ehVerPlanos({ tipo: 'botoes', opcoes: [{ id: 'x', rotulo: 'Cancelar', acao: {} }] }),
    ).toBe(false);
  });
});
