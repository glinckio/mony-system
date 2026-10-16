import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { rotaDoLink } from '@/lib/links-internos';
import { relogio } from '@/lib/relogio';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;
const ID = (final: string) => `0199a000-0000-7000-8000-${final.padStart(12, '0')}`;

const notificacao = (final: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id: ID(final),
  tipo: 'limite_cartao',
  titulo,
  corpo: 'Você já usou R$ 1.600,00 de R$ 2.000,00.',
  linkInterno: `mony://cartoes/${ID('a1')}`,
  criadoEm: '2026-10-14T12:05:00.000Z',
  enviadaEm: '2026-10-14T12:05:00.000Z',
  lidaEm: null,
  ...extra,
});

const tipo = (nome: string, extra: Record<string, unknown> = {}) => ({
  tipo: nome,
  ativo: true,
  antecedenciaDias: null,
  desligavel: true,
  ...extra,
});
const PREFERENCIAS = {
  silencio: null,
  tipos: [
    tipo('limite_cartao'),
    tipo('fatura_vencimento', { antecedenciaDias: 3 }),
    tipo('gasto_fora_padrao'),
    tipo('resumo_periodo'),
    tipo('lembrete'),
    tipo('assinatura', { desligavel: false }),
  ],
};

interface Pedido {
  metodo: string;
  rota: string;
  consulta: Record<string, string>;
  corpo: Record<string, unknown>;
}

function api() {
  const pedidos: Pedido[] = [];
  let lidas = false;
  let novidadeLida = false;
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    const pedido: Pedido = {
      metodo: opcoes?.method ?? 'GET',
      rota: endereco.pathname,
      consulta: Object.fromEntries(endereco.searchParams),
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
    };
    pedidos.push(pedido);
    const json = (corpo: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(corpo), { status }));
    const chave = `${pedido.metodo} ${pedido.rota}`;
    if (chave === 'GET /v1/notificacoes') {
      const itens = [
        notificacao('n1', 'Nubank: 80% do limite', lidas ? { lidaEm: '2026-10-15T10:00:00Z' } : {}),
        notificacao('n2', 'Sua semana: R$ 900,00 em despesas', {
          tipo: 'resumo_periodo',
          linkInterno: 'mony://parcelamentos/x',
          lidaEm: '2026-10-14T13:00:00.000Z',
        }),
      ];
      // A segunda já vem lida; a primeira até o toque ou o "marcar todas".
      const naoLidas = lidas ? [] : itens.slice(0, 1);
      const filtradas = pedido.consulta.naoLidas === 'true' ? naoLidas : itens;
      return json({ itens: filtradas, proximoCursor: null, naoLidas: lidas ? 0 : 1 });
    }
    if (chave === `POST /v1/notificacoes/${ID('n1')}/lida`) {
      lidas = true;
      return json(notificacao('n1', 'Nubank: 80% do limite', { lidaEm: '2026-10-15T10:00:00Z' }));
    }
    if (chave === 'POST /v1/notificacoes/lidas') {
      lidas = true;
      return json({ quantidade: 1 });
    }
    if (chave === 'GET /v1/novidades') {
      return json({
        itens: [
          {
            id: ID('v1'),
            titulo: 'Agora com metas',
            descricao: 'Crie metas e acompanhe pelo Início.',
            videoUrl: 'https://youtu.be/abc123',
            publicadaEm: '2026-10-15T12:00:00.000Z',
            lida: novidadeLida,
          },
          {
            id: ID('v2'),
            titulo: 'Listas de compras',
            descricao: 'Compartilhe a lista com a família.',
            videoUrl: null,
            publicadaEm: '2026-10-01T12:00:00.000Z',
            lida: true,
          },
        ],
        naoLidas: novidadeLida ? 0 : 1,
      });
    }
    if (chave === `POST /v1/novidades/${ID('v1')}/lida`) {
      novidadeLida = true;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (chave === 'GET /v1/preferencias-alerta') return json(PREFERENCIAS);
    if (chave === 'PUT /v1/preferencias-alerta') return json(PREFERENCIAS);
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
    return json(
      { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null } },
      404,
    );
  });
  return pedidos;
}

describe('central de notificações e alertas da Mony (T-087)', () => {
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

  it('RN-105 os links internos viram rotas do app; o que não tem tela não abre', () => {
    expect(rotaDoLink('mony://inicio')).toBe('/');
    expect(rotaDoLink('mony://mony')).toBe('/mony');
    expect(rotaDoLink(`mony://cartoes/${ID('a1')}`)).toBe(`/cartoes/${ID('a1')}`);
    expect(rotaDoLink(`mony://cartoes/${ID('a1')}/faturas/${ID('f1')}`)).toBe(
      `/cartoes/${ID('a1')}/faturas/${ID('f1')}`,
    );
    expect(rotaDoLink('mony://orcamentos?competencia=2026-10')).toEqual({
      pathname: '/orcamentos',
      params: { competencia: '2026-10' },
    });
    expect(rotaDoLink(`mony://transacoes/${ID('c7')}`)).toBe(`/transacoes/${ID('c7')}`);
    expect(rotaDoLink('mony://notificacoes')).toBe('/notificacoes');
    expect(rotaDoLink('mony://notificacoes?aba=novidades')).toEqual({
      pathname: '/notificacoes',
      params: { aba: 'novidades' },
    });
    expect(rotaDoLink(`mony://parcelamentos/${ID('b1')}`)).toBeNull();
    expect(rotaDoLink('https://exemplo.com')).toBeNull();
    expect(rotaDoLink('mony://cartoes/../mais')).toBeNull();
  });

  it(
    'a central: não lidas com o ponto, tocar marca como lida e abre a tela; marcar todas',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/notificacoes' });

      const naoLida = await screen.findByRole(
        'button',
        { name: 'Não lida: Nubank: 80% do limite' },
        ESPERA,
      );
      expect(
        screen.getByRole('button', { name: 'Sua semana: R$ 900,00 em despesas' }),
      ).toBeOnTheScreen();
      expect(screen.getAllByTestId('notificacao')[0]).toHaveTextContent(/14\/out, 09:05/);

      // Não lidas: só a do cartão.
      fireEvent.press(screen.getByRole('tab', { name: 'Não lidas' }));
      await waitFor(() => {
        expect(screen.getAllByTestId('notificacao')).toHaveLength(1);
      }, ESPERA);
      expect(pedidos.some(({ consulta }) => consulta.naoLidas === 'true')).toBe(true);
      fireEvent.press(screen.getByRole('tab', { name: 'Todas' }));
      await waitFor(() => {
        expect(screen.getAllByTestId('notificacao')).toHaveLength(2);
      }, ESPERA);

      // A sem tela (parcelamento) não navega; marcar todas limpa o ponto.
      fireEvent.press(screen.getByRole('button', { name: 'Sua semana: R$ 900,00 em despesas' }));
      expect(screen.getByRole('button', { name: 'Marcar todas como lidas' })).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Marcar todas como lidas' }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Nubank: 80% do limite' })).toBeOnTheScreen();
      }, ESPERA);
      expect(
        pedidos.some(({ metodo, rota }) => metodo === 'POST' && rota === '/v1/notificacoes/lidas'),
      ).toBe(true);
      expect(naoLida).toBeDefined();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'novidades: o push abre a aba, a nova ganha o selo e é lida, e o vídeo abre fora do app',
    async () => {
      const pedidos = api();
      const abrirLink = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      renderRouter(ROTAS, { initialUrl: '/notificacoes?aba=novidades' });

      expect(await screen.findByLabelText('Nova: Agora com metas', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getAllByTestId('novidade')).toHaveLength(2);
      expect(screen.getByText('Compartilhe a lista com a família.')).toBeOnTheScreen();
      await waitFor(() => {
        expect(
          pedidos.some(
            ({ metodo, rota }) => metodo === 'POST' && rota === `/v1/novidades/${ID('v1')}/lida`,
          ),
        ).toBe(true);
      }, ESPERA);
      // A lida antes não é marcada de novo.
      expect(pedidos.some(({ rota }) => rota === `/v1/novidades/${ID('v2')}/lida`)).toBe(false);
      // Depois de ler, o contador da aba some; o selo fica até sair da aba.
      expect(await screen.findByRole('tab', { name: 'Novidades' }, ESPERA)).toBeOnTheScreen();
      expect(screen.getByLabelText('Nova: Agora com metas')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('link', { name: 'Assistir ao vídeo: Agora com metas' }));
      expect(abrirLink).toHaveBeenCalledWith('https://youtu.be/abc123');

      fireEvent.press(screen.getByRole('tab', { name: 'Alertas' }));
      expect(
        await screen.findByRole('button', { name: 'Não lida: Nubank: 80% do limite' }, ESPERA),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'a aba Novidades mostra quantas há sem ler',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/notificacoes' });
      expect(await screen.findByRole('tab', { name: 'Novidades (1)' }, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'tocar na não lida marca e abre o cartão do link',
    async () => {
      const pedidos = api();
      const app = renderRouter(ROTAS, { initialUrl: '/notificacoes' });
      fireEvent.press(
        await screen.findByRole('button', { name: 'Não lida: Nubank: 80% do limite' }, ESPERA),
      );
      await waitFor(() => {
        expect(
          pedidos.some(
            ({ metodo, rota }) => metodo === 'POST' && rota === `/v1/notificacoes/${ID('n1')}/lida`,
          ),
        ).toBe(true);
      }, ESPERA);
      await waitFor(() => {
        expect(app.getPathname()).toBe(`/cartoes/${ID('a1')}`);
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-100 RN-101 RN-108 alertas da Mony: desliga um tipo, muda a antecedência e liga o silêncio',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais/alertas' });

      const lembretes = await screen.findByRole('switch', { name: 'Limite do cartão' }, ESPERA);
      expect(lembretes).toBeOnTheScreen();
      // Só os alertas que o app já manda: lembretes ficam de fora; assinatura não desliga.
      expect(screen.queryByRole('switch', { name: 'Lembretes' })).toBeNull();
      expect(screen.getByRole('switch', { name: 'Assinatura' })).toBeDisabled();
      expect(screen.getByText('Sempre ligado')).toBeOnTheScreen();

      fireEvent(screen.getByRole('switch', { name: 'Gasto fora do padrão' }), 'valueChange', false);
      fireEvent.press(screen.getByRole('button', { name: '1 dia antes' }));
      fireEvent(screen.getByRole('switch', { name: 'Horário de silêncio' }), 'valueChange', true);
      fireEvent.changeText(screen.getByLabelText('Termina às'), '0730');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(await screen.findByText('Alertas salvos.', {}, ESPERA)).toBeOnTheScreen();
      expect(pedidos.find(({ metodo }) => metodo === 'PUT')?.corpo).toEqual({
        silencio: { inicio: '22:00', fim: '07:30' },
        tipos: [
          { tipo: 'fatura_vencimento', antecedenciaDias: 1 },
          { tipo: 'gasto_fora_padrao', ativo: false },
        ],
      });

      // Hora errada não salva.
      fireEvent.changeText(screen.getByLabelText('Começa às'), '25');
      expect(screen.getByText('Hora no formato 22:00.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'o Perfil abre os alertas da Mony',
    async () => {
      api();
      const app = renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByRole('button', { name: 'Alertas da Mony' }, ESPERA));
      await waitFor(() => {
        expect(app.getPathname()).toBe('/mais/alertas');
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );
});
