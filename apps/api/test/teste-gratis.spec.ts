/**
 * Teste grátis de 3 dias (T-101): as regras puras do controle de um teste por pessoa e dos avisos.
 * O caminho com o banco está em `teste-gratis.integracao.spec.ts`.
 */
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  avisoDoTeste,
  controlesDoTeste,
  emailDoControle,
  textoDoAvisoDoTeste,
  textoDoResumo,
} from '../src/modulos/planos/dominio/teste';

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');
const FUSO = 'America/Sao_Paulo';
/** Cadastro numa quinta, 12:00 em São Paulo; o teste vai até domingo, 12:00. */
const INICIO = new Date('2026-10-15T15:00:00Z');
const FIM = new Date('2026-10-18T15:00:00Z');
/** 09:05 em São Paulo, a hora da rotina diária. */
const noDia = (data: string) => new Date(`${data}T12:05:00Z`);
const NADA = { lancamentos: 0, despesasCentavos: 0, cartoes: 0, orcamentos: 0, metas: 0 };

describe('um teste por pessoa (RN-125)', () => {
  it('o e-mail vale pela caixa de entrada: sem maiúsculas, sem +etiqueta e, no Gmail, sem pontos', () => {
    expect(emailDoControle('  Ana.Souza+mony@Gmail.com ')).toBe('anasouza@gmail.com');
    expect(emailDoControle('ana.souza@googlemail.com')).toBe('anasouza@gmail.com');
    expect(emailDoControle('Ana.Souza+teste@Exemplo.com.br')).toBe('ana.souza@exemplo.com.br');
  });

  it('controla o e-mail, o aparelho e o login do Google ou da Apple, só em resumo', () => {
    expect(controlesDoTeste({ email: 'Ana@Exemplo.com', aparelho: 'aparelho-1' })).toEqual([
      { tipo: 'email', valorHash: sha256('ana@exemplo.com') },
      { tipo: 'aparelho', valorHash: sha256('aparelho-1') },
    ]);
    const social = controlesDoTeste({
      email: 'ana@exemplo.com',
      aparelho: 'aparelho-1',
      loginSocial: { provedor: 'apple', idExterno: '001234.abc' },
    });
    expect(social.at(-1)).toEqual({ tipo: 'apple', valorHash: sha256('001234.abc') });
    expect(JSON.stringify(social)).not.toContain('ana@');
  });
});

describe('avisos do teste (RN-124, RN-126)', () => {
  const teste = { plano: 'teste' as const, testeInicio: INICIO, testeFim: FIM };

  it('no 2º dia, no último (menos de 24 h para acabar) e na primeira rodada depois do fim', () => {
    expect(avisoDoTeste(teste, noDia('2026-10-15'), FUSO)).toBeNull();
    expect(avisoDoTeste(teste, noDia('2026-10-16'), FUSO)).toBe('segundo_dia');
    expect(avisoDoTeste(teste, noDia('2026-10-17'), FUSO)).toBeNull();
    expect(avisoDoTeste(teste, noDia('2026-10-18'), FUSO)).toBe('ultimo_dia');
    expect(avisoDoTeste(teste, noDia('2026-10-19'), FUSO)).toBe('fim');
    // Já encerrado pela rotina: o aviso do fim sai igual; no dia seguinte, nada.
    expect(avisoDoTeste({ ...teste, plano: 'gratuito' }, noDia('2026-10-19'), FUSO)).toBe('fim');
    expect(avisoDoTeste({ ...teste, plano: 'gratuito' }, noDia('2026-10-20'), FUSO)).toBeNull();
  });

  it('cadastro cedo: o último dia é a véspera, quando a rodada de 09:00 do fim já seria tarde', () => {
    const cedo = {
      plano: 'teste' as const,
      testeInicio: new Date('2026-10-15T10:00:00Z'),
      testeFim: new Date('2026-10-18T10:00:00Z'),
    };
    expect(avisoDoTeste(cedo, noDia('2026-10-16'), FUSO)).toBe('segundo_dia');
    expect(avisoDoTeste(cedo, noDia('2026-10-17'), FUSO)).toBe('ultimo_dia');
    expect(avisoDoTeste(cedo, noDia('2026-10-18'), FUSO)).toBe('fim');
  });

  it('quem assinou, quem nunca teve teste e quem entrou direto no gratuito não recebem', () => {
    expect(avisoDoTeste({ ...teste, plano: 'mensal' }, noDia('2026-10-16'), FUSO)).toBeNull();
    expect(avisoDoTeste({ ...teste, plano: 'anual' }, noDia('2026-10-19'), FUSO)).toBeNull();
    expect(
      avisoDoTeste(
        { plano: 'gratuito', testeInicio: null, testeFim: null },
        noDia('2026-10-19'),
        FUSO,
      ),
    ).toBeNull();
  });

  it('RN-124 o resumo do que a pessoa já registrou', () => {
    expect(textoDoResumo(NADA)).toBeNull();
    expect(textoDoResumo({ ...NADA, lancamentos: 1, despesasCentavos: 0 })).toBe('1 lançamento');
    expect(
      textoDoResumo({
        lancamentos: 12,
        despesasCentavos: 123_456,
        cartoes: 2,
        orcamentos: 1,
        metas: 0,
      })?.replaceAll('\u00a0', ' '),
    ).toBe('12 lançamentos (R$ 1.234,56 em despesas), 2 cartões e 1 orçamento');
  });

  it('os textos do push e da Mony', () => {
    const resumo = { ...NADA, lancamentos: 3, despesasCentavos: 4_500, cartoes: 1 };
    const segundo = textoDoAvisoDoTeste('segundo_dia', {
      testeFim: FIM,
      agora: noDia('2026-10-16'),
      fuso: FUSO,
      resumo,
    });
    expect(segundo.titulo).toBe('Seu 2º dia de teste grátis');
    expect(segundo.corpo.replaceAll('\u00a0', ' ')).toBe(
      'Até agora você registrou 3 lançamentos (R$ 45,00 em despesas) e 1 cartão. Tudo está liberado até o fim do teste.',
    );
    expect(segundo.textoChat).toBe(`Seu teste grátis está no 2º dia. ${segundo.corpo}`);

    const ultimo = textoDoAvisoDoTeste('ultimo_dia', {
      testeFim: FIM,
      agora: noDia('2026-10-18'),
      fuso: FUSO,
      resumo: NADA,
    });
    expect(ultimo.titulo).toBe('Seu teste grátis acaba hoje às 12:00');
    expect(ultimo.corpo).toBe(
      'Depois, o plano gratuito tem limites. Ainda dá tempo de testar tudo.',
    );
    expect(
      textoDoAvisoDoTeste('ultimo_dia', {
        testeFim: new Date('2026-10-18T10:00:00Z'),
        agora: noDia('2026-10-17'),
        fuso: FUSO,
        resumo: NADA,
      }).titulo,
    ).toBe('Seu teste grátis acaba amanhã às 07:00');

    const fim = textoDoAvisoDoTeste('fim', {
      testeFim: FIM,
      agora: noDia('2026-10-19'),
      fuso: FUSO,
      resumo,
    });
    expect(fim.titulo).toBe('Seu teste grátis acabou');
    expect(fim.corpo).toContain('Tudo o que você registrou continua aqui.');
  });
});
