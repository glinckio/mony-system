import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SituacaoAssinaturaPaga, UsoPlano } from '@mony/shared/planos';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as WebBrowser from 'expo-web-browser';

import { rotaDoLink } from '@/lib/links-internos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

// A dica da primeira conversa (T-046) busca o onboarding; aqui o assunto é o [Ver planos].
jest.mock('@/features/onboarding/components/dica', () => ({ Dica: () => null }));
// O navegador do app (Stripe Checkout e portal): cada teste diz como ele fecha.
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: { CANCEL: 'cancel' },
}));

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

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

const PRECOS = {
  planos: [
    { plano: 'mensal', valorCentavos: 1990 },
    { plano: 'anual', valorCentavos: 19900 },
  ],
};

const ANUAL: UsoPlano = { plano: 'anual', limitado: false, testeFim: null, limites: [] };

const SITUACAO_ANUAL: SituacaoAssinaturaPaga = {
  plano: 'anual',
  status: 'ativa',
  valorCentavos: 19900,
  proximaCobranca: '2027-10-15T19:42:05.000Z',
  cancelamentoAgendado: false,
  testeFim: null,
  gerenciavel: true,
  pagoAte: null,
};

const SITUACAO_TESTE: SituacaoAssinaturaPaga = {
  plano: 'teste',
  status: 'ativa',
  valorCentavos: null,
  proximaCobranca: null,
  cancelamentoAgendado: false,
  testeFim: TESTE.testeFim,
  gerenciavel: false,
  pagoAte: null,
};

/** T-105: o anual pago com Pix, sem renovação automática. */
const SITUACAO_PIX: SituacaoAssinaturaPaga = {
  ...SITUACAO_ANUAL,
  proximaCobranca: null,
  pagoAte: '2027-10-15T15:00:00.000Z',
};

/** Os corpos de `POST /assinatura/checkout`, na ordem. */
const checkouts: unknown[] = [];

/** O que a API responde agora; o teste troca no meio (ex.: o webhook liberou o plano). */
interface EstadoApi {
  uso: UsoPlano;
  situacao: SituacaoAssinaturaPaga;
}

function api(uso: UsoPlano, estado: EstadoApi = { uso, situacao: SITUACAO_TESTE }) {
  const pedidos: string[] = [];
  checkouts.length = 0;
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const chave = `${opcoes?.method ?? 'GET'} ${endereco.pathname}`;
    pedidos.push(chave);
    const json = (corpo: unknown) =>
      Promise.resolve(new Response(JSON.stringify(corpo), { status: 200 }));
    if (chave === 'GET /v1/assinatura/uso') return json(estado.uso);
    if (chave === 'GET /v1/assinatura') return json(estado.situacao);
    if (chave === 'GET /v1/planos') return json(PRECOS);
    if (chave === 'POST /v1/assinatura/checkout') {
      checkouts.push(typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : null);
      return json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    }
    if (chave === 'POST /v1/assinatura/portal') {
      return json({ url: 'https://billing.stripe.com/p/session/test_1' });
    }
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

  it('RN-123 o link dos planos abre a tela de planos (T-103)', () => {
    expect(rotaDoLink('mony://planos')).toBe('/planos');
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
      expect(screen.getByRole('button', { name: 'Ver planos' })).toBeOnTheScreen();
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
    'RN-123 o [Ver planos] da Mony abre a tela de planos, sem ir a /mony/acoes',
    async () => {
      const pedidos = api(GRATUITO);
      const app = renderRouter(ROTAS, { initialUrl: '/mony' });
      fireEvent.press(await screen.findByRole('button', { name: 'Ver planos' }, ESPERA));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/planos');
      }, ESPERA);
      expect(
        await screen.findByText('Continue com a Mony cuidando do seu dinheiro', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(pedidos.some((pedido) => pedido.includes('/mony/acoes'))).toBe(false);
    },
    TEMPO_LIMITE_MS,
  );
  it(
    'T-103 os planos com os preços da API, o anual escolhido e quanto falta do teste',
    async () => {
      api(TESTE);
      renderRouter(ROTAS, { initialUrl: '/planos' });
      const anual = await screen.findByRole('radio', { name: 'Anual, R$ 199,00/ano' }, ESPERA);
      expect(anual).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Mensal, R$ 19,90/mês' })).not.toBeChecked();
      expect(screen.getByText('equivale a R$ 16,58 por mês')).toBeOnTheScreen();
      expect(screen.getByText('Seu teste termina em 3 dias')).toBeOnTheScreen();
      expect(screen.getByText('Lançamentos ilimitados com a Mony')).toBeOnTheScreen();
      // A Stripe não aceita Pix em assinatura (T-102): o rodapé fala só do cartão.
      expect(
        screen.getByText('Cartão · renovação automática · cancele quando quiser'),
      ).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('radio', { name: 'Mensal, R$ 19,90/mês' }));
      expect(screen.getByRole('button', { name: 'Assinar plano mensal' })).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-128 assinar: abre o checkout, volta ao app e espera a API liberar o plano',
    async () => {
      const estado: EstadoApi = { uso: TESTE, situacao: SITUACAO_TESTE };
      const pedidos = api(TESTE, estado);
      jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(() => {
        // Enquanto a página da Stripe está aberta, o webhook libera o plano.
        estado.uso = ANUAL;
        estado.situacao = SITUACAO_ANUAL;
        return Promise.resolve({ type: 'success', url: 'mony://planos?checkout=sucesso' });
      });
      const app = renderRouter(ROTAS, { initialUrl: '/planos' });
      fireEvent.press(await screen.findByRole('button', { name: 'Assinar plano anual' }, ESPERA));

      await waitFor(() => {
        expect(app.getPathname()).toBe('/mais/plano');
      }, ESPERA);
      expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
        'https://checkout.stripe.com/c/pay/cs_test_1',
        'mony://planos',
      );
      expect(pedidos).toContain('POST /v1/assinatura/checkout');
      expect(await screen.findByText('Plano anual', {}, ESPERA)).toBeOnTheScreen();
      expect(await screen.findByText('R$ 199,00 por ano', {}, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-128 fechar o checkout sem pagar deixa a pessoa nos planos, sem esperar',
    async () => {
      const pedidos = api(TESTE);
      jest
        .mocked(WebBrowser.openAuthSessionAsync)
        .mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
      const app = renderRouter(ROTAS, { initialUrl: '/planos' });
      fireEvent.press(await screen.findByRole('button', { name: 'Assinar plano anual' }, ESPERA));
      await waitFor(() => {
        expect(pedidos.filter((pedido) => pedido === 'GET /v1/assinatura')).toHaveLength(1);
      }, ESPERA);
      expect(
        await screen.findByRole('button', { name: 'Assinar plano anual' }, ESPERA),
      ).toBeEnabled();
      expect(screen.queryByText('Confirmando o pagamento…')).toBeNull();
      expect(app.getPathname()).toBe('/planos');
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'T-103 com plano pago, os planos levam ao seu plano: valor, próxima cobrança e o portal',
    async () => {
      const pedidos = api(ANUAL, { uso: ANUAL, situacao: SITUACAO_ANUAL });
      jest
        .mocked(WebBrowser.openAuthSessionAsync)
        .mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
      const app = renderRouter(ROTAS, { initialUrl: '/planos' });
      await waitFor(() => {
        expect(app.getPathname()).toBe('/mais/plano');
      }, ESPERA);
      expect(await screen.findByText('R$ 199,00 por ano', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Próxima cobrança em 15/out.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Ver planos' })).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Gerenciar assinatura' }));
      await waitFor(() => {
        expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
          'https://billing.stripe.com/p/session/test_1',
          'mony://planos',
        );
      }, ESPERA);
      expect(pedidos).toContain('POST /v1/assinatura/portal');
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-131 cobrança recusada: o aviso para atualizar a forma de pagamento',
    async () => {
      api(ANUAL, {
        uso: ANUAL,
        situacao: { ...SITUACAO_ANUAL, status: 'inadimplente', cancelamentoAgendado: false },
      });
      renderRouter(ROTAS, { initialUrl: '/mais/plano' });
      expect(
        await screen.findByText(
          'Não consegui cobrar a última fatura. Atualize a forma de pagamento para não voltar ao plano gratuito.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'T-103 cancelamento agendado: quando termina, sem renovar',
    async () => {
      api(ANUAL, { uso: ANUAL, situacao: { ...SITUACAO_ANUAL, cancelamentoAgendado: true } });
      renderRouter(ROTAS, { initialUrl: '/mais/plano' });
      expect(
        await screen.findByText('Termina em 15/out. Não vai ser renovado.', {}, ESPERA),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'T-105 no anual, pagar com Pix abre o pagamento único e espera a API liberar os 12 meses',
    async () => {
      const estado: EstadoApi = { uso: TESTE, situacao: SITUACAO_TESTE };
      api(TESTE, estado);
      jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(() => {
        estado.uso = ANUAL;
        estado.situacao = SITUACAO_PIX;
        return Promise.resolve({ type: 'success', url: 'mony://planos?checkout=sucesso' });
      });
      const app = renderRouter(ROTAS, { initialUrl: '/planos' });
      expect(
        await screen.findByText(
          'Com Pix, só no anual: 12 meses pagos de uma vez, sem renovação automática.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Pagar 12 meses com Pix' }));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/mais/plano');
      }, ESPERA);
      expect(checkouts).toEqual([{ plano: 'anual', forma: 'pix' }]);
      expect(
        await screen.findByText('Pago com Pix. Vale até 15/out e não renova sozinho.', {}, ESPERA),
      ).toBeOnTheScreen();
      // Sem assinatura no cartão, não há o que gerenciar no portal.
      expect(screen.queryByRole('button', { name: 'Gerenciar assinatura' })).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'T-105 o mensal não oferece o Pix',
    async () => {
      api(TESTE);
      renderRouter(ROTAS, { initialUrl: '/planos' });
      fireEvent.press(await screen.findByRole('radio', { name: /^Mensal/ }, ESPERA));
      expect(screen.queryByRole('button', { name: 'Pagar 12 meses com Pix' })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Assinar plano mensal' }));
      await waitFor(() => {
        expect(checkouts).toEqual([{ plano: 'mensal', forma: 'cartao' }]);
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'T-105 em Seu plano, pagar mais 12 meses com Pix espera o novo fim',
    async () => {
      const estado: EstadoApi = { uso: ANUAL, situacao: SITUACAO_PIX };
      api(ANUAL, estado);
      jest.mocked(WebBrowser.openAuthSessionAsync).mockImplementation(() => {
        estado.situacao = { ...SITUACAO_PIX, pagoAte: '2028-11-20T15:00:00.000Z' };
        return Promise.resolve({ type: 'success', url: 'mony://planos?checkout=sucesso' });
      });
      renderRouter(ROTAS, { initialUrl: '/mais/plano' });
      fireEvent.press(
        await screen.findByRole('button', { name: 'Pagar mais 12 meses com Pix' }, ESPERA),
      );
      expect(
        await screen.findByText('Pago com Pix. Vale até 20/nov e não renova sozinho.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(checkouts).toEqual([{ plano: 'anual', forma: 'pix' }]);
    },
    TEMPO_LIMITE_MS,
  );
});
