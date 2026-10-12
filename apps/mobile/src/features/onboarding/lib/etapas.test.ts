import { describe, expect, it } from '@jest/globals';
import type { Onboarding } from '@mony/shared/usuario';

import { aplicarAtualizacao, contarFeitas, etapaPendente, etapasPendentes } from './etapas';

const BASE: Onboarding = {
  concluido: false,
  etapas: [
    { etapa: 'primeiro-lancamento', situacao: 'concluida', em: '2026-10-09T12:00:00.000Z' },
    { etapa: 'cartoes', situacao: 'pendente', em: null },
    { etapa: 'orcamento', situacao: 'pendente', em: null },
    { etapa: 'permissoes', situacao: 'dispensada', em: '2026-10-09T12:00:00.000Z' },
    { etapa: 'tour', situacao: 'pendente', em: null },
  ],
  checklistVisivel: true,
  dicasVistas: ['inicio.saldo'],
};

describe('passos do onboarding (RN-024)', () => {
  it('RN-024 concluídas e dispensadas contam como feitas; o resto fica pendente, na ordem', () => {
    expect(contarFeitas(BASE)).toBe(2);
    expect(etapasPendentes(BASE)).toEqual(['cartoes', 'orcamento', 'tour']);
    expect(etapaPendente(BASE, 'tour')).toBe(true);
    expect(etapaPendente(BASE, 'permissoes')).toBe(false);
  });

  it('RN-024 concluída vale mais que dispensada, e nada volta a pendente', () => {
    const depois = aplicarAtualizacao(BASE, {
      etapas: {
        'primeiro-lancamento': 'dispensada',
        permissoes: 'concluida',
        cartoes: 'dispensada',
      },
    });
    expect(depois.etapas.map(({ etapa, situacao }) => [etapa, situacao])).toEqual([
      ['primeiro-lancamento', 'concluida'],
      ['cartoes', 'dispensada'],
      ['orcamento', 'pendente'],
      ['permissoes', 'concluida'],
      ['tour', 'pendente'],
    ]);
    expect(depois.checklistVisivel).toBe(true);
  });

  it('RN-024 o checklist some quando não sobra passo pendente', () => {
    const depois = aplicarAtualizacao(BASE, {
      etapas: { cartoes: 'concluida', orcamento: 'dispensada', tour: 'concluida' },
    });
    expect(depois.checklistVisivel).toBe(false);
    expect(contarFeitas(depois)).toBe(5);
  });

  it('junta as dicas vistas sem repetir e marca o fim do fluxo', () => {
    const depois = aplicarAtualizacao(BASE, {
      concluido: true,
      dicasVistas: ['transacoes.selecao', 'inicio.saldo'],
    });
    expect(depois.concluido).toBe(true);
    expect(depois.dicasVistas).toEqual(['inicio.saldo', 'transacoes.selecao']);
    expect(aplicarAtualizacao(BASE, {}).concluido).toBe(false);
  });
});
