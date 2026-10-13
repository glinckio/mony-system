import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { UsoPlano } from '@mony/shared/planos';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { rotaDoLink } from '@/lib/links-internos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

// A dica da primeira conversa (T-046) busca o onboarding; aqui o assunto é o [Ver planos].
jest.mock('@/features/onboarding/components/dica', () => ({ Dica: () => null }));

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 30_000;

const GRATUITO: UsoPlano = {
  plano: 'gratuito',
  limitado: true,
  testeFim: null,
  limites: [
    {
      recurso: 'lancamento',
      periodo: 'dia',
      uso: 3,
      limite: 3,
      renovaEm: '2026-10-16T03:00:00.000Z',
    },
    {
      recurso: 'lancamento',
      periodo: 'mes',
      uso: 9,
      limite: 30,
      renovaEm: '2026-11-01T03:00:00.000Z',
    },
    {
      recurso: 'mensagem_mony',
      periodo: 'dia',
      uso: 2,
      limite: 10,
      renovaEm: '2026-10-16T03:00:00.000Z',
    },
    {
      recurso: 'leitura_documento',
      periodo: 'mes',
      uso: 3,
      limite: 3,
      renovaEm: '2026-11-01T03:00:00.000Z',
    },
    { recurso: 'cartao', periodo: 'quantidade', uso: 1, limite: 1, renovaEm: null },
  ],
};

const TESTE: UsoPlano = {
  plano: 'teste',
  limitado: false,
  testeFim: '2026-10-18T15:00:00.000Z',
  limites: [],
};

/** O chat abre com o aviso do limite e o [Ver planos] (RN-123). */
const CONVERSA = {
  itens: [
    {
      id: '0199a000-0000-7000-8000-0000000000c2',
      autor: 'mony',
      tipo: 'texto',
      conteudo:
        'Você chegou ao limite de 3 lançamentos por dia do plano gratuito. Amanhã libera de novo.',
      componentes: [
        {
          tipo: 'botoes',
          opcoes: [
            {
              id: 'ver-planos',
              rotulo: 'Ver planos',
              acao: { tipo: 'abrir', link: 'mony://planos' },
            },
          ],
        },
      ],
      criadoEm: '2026-10-15T15:00:00.000Z',
    },
  ],
  proximoCursor: null,
  sugestoes: [],
};

function api(uso: UsoPlano) {
  const pedidos: string[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const chave = `${opcoes?.method ?? 'GET'} ${endereco.pathname}`;
    pedidos.push(chave);
    const json = (corpo: unknown) =>
      Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }));
    if (chave === 'GET /v1/assinatura/uso') return json(uso);
    if (chave === 'GET /v1/mony/conversa') return json(CONVERSA);
    if (chave === 'GET /v1/me') {
      return json({
        id: 'u1',
        nome: 'Ana',
        email: 'ana@exemplo.com',
        telefone: null,
        fusoHorario: 'America/Sao_Paulo',
        onboardingConcluido: true,
      });
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null },
        }),
        { status: 404 },
      ),
    );
  });
  return pedidos;
}

describe('seu plano e o [Ver planos] (T-100)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    jest.spyOn(relogio, 'agora').mockReturnValue(new Date('2026-10-15T15:00:00.000Z'));
    useSessao.getState().encerrar();
    useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it('RN-123 o link dos planos abre a tela do plano', () => {
    expect(rotaDoLink('mony://planos')).toBe('/mais/plano');
  });

  it(
    'RN-120 no gratuito: o uso de cada limite, o que acabou e quando volta',
    async () => {
      api(GRATUITO);
      renderRouter(ROTAS, { initialUrl: '/mais/plano' });

      expect(await screen.findByText('Plano gratuito', {}, ESPERA)).toBeOnTheScreen();
      const limites = screen.getAllByTestId('limite-plano');
      expect(limites).toHaveLength(5);
      expect(limites[0]).toHaveTextContent(
        /Lançamentos hoje3 de 3.*Acabou por hoje\. Amanhã libera de novo\./,
      );
      expect(limites[1]).toHaveTextContent('Lançamentos no mês9 de 30');
      expect(limites[2]).toHaveTextContent('Mensagens para a Mony hoje2 de 10');
      expect(limites[3]).toHaveTextContent(
        /de foto, PDF ou cupom no mês3 de 3.*No dia 1º libera de novo/,
      );
      expect(limites[4]).toHaveTextContent(/Cartões1 de 1.*Para ter mais, conheça os planos\./);
      expect(screen.getByText('Os relatórios mostram só o mês atual.')).toBeOnTheScreen();
      expect(screen.getByText('Os planos pagos chegam em breve.')).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'no teste, tudo liberado até o fim dele, no fuso do usuário',
    async () => {
      api(TESTE);
      renderRouter(ROTAS, { initialUrl: '/mais/plano' });
      expect(await screen.findByText('Teste grátis', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Tudo liberado até 18/out, 12:00.')).toBeOnTheScreen();
      expect(screen.queryByTestId('limite-plano')).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'o Perfil abre o seu plano',
    async () => {
      api(GRATUITO);
      const app = renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByRole('button', { name: 'Seu plano' }, ESPERA));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/mais/plano');
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'T-101 no teste, o selo "Teste grátis" na linha do plano do Perfil',
    async () => {
      api(TESTE);
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      expect(await screen.findByText('Teste grátis', {}, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-123 o [Ver planos] da Mony abre o seu plano, sem ir a /mony/acoes',
    async () => {
      const pedidos = api(GRATUITO);
      const app = renderRouter(ROTAS, { initialUrl: '/mony' });
      fireEvent.press(await screen.findByRole('button', { name: 'Ver planos' }, ESPERA));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/mais/plano');
      }, ESPERA);
      expect(await screen.findByText('Plano gratuito', {}, ESPERA)).toBeOnTheScreen();
      expect(pedidos.some((pedido) => pedido.includes('/mony/acoes'))).toBe(false);
    },
    TEMPO_LIMITE_MS,
  );
});
