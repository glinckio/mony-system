import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { EtapaOnboarding, Onboarding, SituacaoEtapa } from '@mony/shared/usuario';
import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { PEDIDOS_DE_PERMISSAO } from '@/lib/permissoes';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

function onboarding(
  situacoes: Partial<Record<EtapaOnboarding, SituacaoEtapa>> = {},
  extra: Partial<Onboarding> = {},
): Onboarding {
  const etapas = (
    ['primeiro-lancamento', 'cartoes', 'orcamento', 'permissoes', 'tour'] as const
  ).map((etapa) => ({
    etapa,
    situacao: situacoes[etapa] ?? 'pendente',
    em: situacoes[etapa] === undefined ? null : '2026-10-09T12:00:00.000Z',
  }));
  return {
    concluido: true,
    etapas,
    checklistVisivel: etapas.some(({ situacao }) => situacao === 'pendente'),
    dicasVistas: [],
    ...extra,
  };
}

interface Pedido {
  metodo: string;
  rota: string;
  corpo: Record<string, unknown>;
}

/** API falsa: o progresso do onboarding e o PATCH dele; o resto responde 404. */
function api(
  estado: Onboarding,
  patch: (corpo: Record<string, unknown>) => { status: number; corpo?: unknown } = () => ({
    status: 200,
    corpo: estado,
  }),
) {
  const pedidos: Pedido[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const rota = new URL(endereco).pathname;
    const metodo = opcoes?.method ?? 'GET';
    const corpo = (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
      string,
      unknown
    >;
    pedidos.push({ metodo, rota, corpo });
    let resposta: { status: number; corpo?: unknown } = {
      status: 404,
      corpo: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado.', detalhes: null } },
    };
    if (rota === '/v1/me/onboarding') {
      resposta = metodo === 'PATCH' ? patch(corpo) : { status: 200, corpo: estado };
    }
    return Promise.resolve(
      new Response(resposta.corpo === undefined ? null : JSON.stringify(resposta.corpo), {
        status: resposta.status,
      }),
    );
  });
  return pedidos;
}

const patches = (pedidos: Pedido[]) =>
  pedidos.filter(({ metodo, rota }) => metodo === 'PATCH' && rota === '/v1/me/onboarding');

function entrar(onboardingConcluido: boolean) {
  useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido }, 'acesso');
}

describe('onboarding (T-046)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().encerrar();
  });

  // As notificações já têm o pedido de verdade (T-088); os testes que trocam voltam a ele.
  const pedidoDeNotificacoes = PEDIDOS_DE_PERMISSAO.notificacoes;

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    PEDIDOS_DE_PERMISSAO.notificacoes = pedidoDeNotificacoes;
    delete PEDIDOS_DE_PERMISSAO.agenda;
  });

  it(
    'duas telas de boas-vindas, as permissões e "Concluir", que grava no servidor e abre o Início',
    async () => {
      const pedidos = api(onboarding({ permissoes: 'concluida' }));
      entrar(false);
      renderRouter(ROTAS, { initialUrl: '/' });

      expect(
        screen.getByRole('header', { name: 'Registre gastos só conversando' }),
      ).toBeOnTheScreen();
      expect(screen.getByRole('progressbar', { name: 'Etapa 1 de 3' })).toBeOnTheScreen();
      expect(screen.getByLabelText('Exemplo de conversa com a Mony')).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(screen.getByRole('header', { name: 'Avisos antes do aperto' })).toBeOnTheScreen();
      expect(screen.getByRole('progressbar', { name: 'Etapa 2 de 3' })).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(
        await screen.findByRole('header', { name: 'Deixe a Mony te avisar na hora certa' }, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByText('Etapa 3 de 3')).toBeOnTheScreen();
      // Só as notificações têm o pedido (T-088); agenda, apps de compra e banco vêm depois
      // (T-085, T-121, T-120).
      expect(screen.getAllByText('Em breve')).toHaveLength(3);

      fireEvent.press(screen.getByRole('button', { name: 'Concluir' }));
      expect(await screen.findByRole('header', { name: 'Início' }, ESPERA)).toBeOnTheScreen();
      expect(patches(pedidos)[0]?.corpo).toEqual({
        concluido: true,
        etapas: { permissoes: 'concluida' },
      });
      expect(useSessao.getState().usuario?.onboardingConcluido).toBe(true);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    '"Pular" vai às permissões, e "Configurar depois" termina sem marcar o passo',
    async () => {
      const pedidos = api(onboarding());
      entrar(false);
      renderRouter(ROTAS, { initialUrl: '/' });

      fireEvent.press(screen.getByRole('button', { name: 'Pular' }));
      fireEvent.press(await screen.findByRole('button', { name: 'Configurar depois' }, ESPERA));

      expect(await screen.findByRole('header', { name: 'Início' }, ESPERA)).toBeOnTheScreen();
      expect(patches(pedidos)[0]?.corpo).toEqual({ concluido: true });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'erro ao concluir aparece e o app fica nas permissões',
    async () => {
      api(onboarding(), () => ({
        status: 503,
        corpo: { erro: { codigo: 'INDISPONIVEL', mensagem: 'Tente de novo.', detalhes: null } },
      }));
      entrar(false);
      renderRouter(ROTAS, { initialUrl: '/permissoes' });

      fireEvent.press(await screen.findByRole('button', { name: 'Concluir' }, ESPERA));
      expect(
        await screen.findByRole('alert', { name: 'Tente de novo.' }, ESPERA),
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('header', { name: 'Deixe a Mony te avisar na hora certa' }),
      ).toBeOnTheScreen();
      expect(useSessao.getState().usuario?.onboardingConcluido).toBe(false);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'com o módulo no build, ligar pede ao sistema; recusada, explica onde liberar',
    async () => {
      const pedirNotificacoes = jest.fn(() => Promise.resolve(true));
      PEDIDOS_DE_PERMISSAO.notificacoes = {
        estado: () => Promise.resolve('nao-pedida'),
        pedir: pedirNotificacoes,
      };
      PEDIDOS_DE_PERMISSAO.agenda = {
        estado: () => Promise.resolve('nao-pedida'),
        pedir: () => Promise.resolve(false),
      };
      api(onboarding());
      entrar(false);
      renderRouter(ROTAS, { initialUrl: '/permissoes' });

      const notificacoes = await screen.findByLabelText('Notificações', {}, ESPERA);
      expect(notificacoes).toHaveProp('value', false);
      fireEvent(notificacoes, 'valueChange', true);
      await waitFor(() => {
        expect(screen.getByLabelText('Notificações')).toHaveProp('value', true);
      });
      expect(pedirNotificacoes).toHaveBeenCalledTimes(1);

      fireEvent(screen.getByLabelText('Agenda'), 'valueChange', true);
      expect(
        await screen.findByText('Para liberar, abra as configurações do aparelho.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getAllByText('Em breve')).toHaveLength(2);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-024 checklist no Início: anel, próximos passos, dispensar e fazer agora',
    async () => {
      const estado = onboarding({ 'primeiro-lancamento': 'concluida', permissoes: 'concluida' });
      const pedidos = api(estado, () => ({
        status: 200,
        corpo: onboarding({
          'primeiro-lancamento': 'concluida',
          permissoes: 'concluida',
          orcamento: 'dispensada',
        }),
      }));
      entrar(true);
      renderRouter(ROTAS, { initialUrl: '/' });

      expect(
        await screen.findByRole('header', { name: 'Termine de configurar' }, ESPERA),
      ).toBeOnTheScreen();
      expect(
        screen.getByRole('progressbar', { name: '2 de 5 passos feitos' }),
      ).toHaveAccessibilityValue({
        min: 0,
        max: 5,
        now: 2,
      });
      expect(
        screen.getByText('Cadastre seus cartões e defina os orçamentos do mês.'),
      ).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      const folha = await screen.findByTestId('folha-checklist', {}, ESPERA);
      const orcamento = within(folha).getByTestId('etapa-orcamento');
      // O orçamento abre a tela dele (T-052); o tour não tem tela e só dá para dispensar.
      expect(within(orcamento).getByRole('button', { name: 'Fazer agora' })).toBeOnTheScreen();
      expect(
        within(within(folha).getByTestId('etapa-tour')).queryByRole('button', {
          name: 'Fazer agora',
        }),
      ).toBeNull();
      fireEvent.press(within(orcamento).getByRole('button', { name: 'Dispensar' }));
      expect(await within(orcamento).findByText('Dispensado', {}, ESPERA)).toBeOnTheScreen();
      await waitFor(() => {
        expect(patches(pedidos)[0]?.corpo).toEqual({ etapas: { orcamento: 'dispensada' } });
      });
      expect(
        within(within(folha).getByTestId('etapa-primeiro-lancamento')).getByText('Feito'),
      ).toBeOnTheScreen();

      fireEvent.press(
        within(within(folha).getByTestId('etapa-cartoes')).getByRole('button', {
          name: 'Fazer agora',
        }),
      );
      expect(await screen.findByRole('header', { name: 'Cartões' }, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-024 sem passo pendente, o checklist não aparece',
    async () => {
      const pedidos = api(
        onboarding({
          'primeiro-lancamento': 'concluida',
          cartoes: 'concluida',
          orcamento: 'dispensada',
          permissoes: 'concluida',
          tour: 'dispensada',
        }),
      );
      entrar(true);
      renderRouter(ROTAS, { initialUrl: '/' });

      await waitFor(() => {
        expect(pedidos.some(({ rota }) => rota === '/v1/me/onboarding')).toBe(true);
      });
      expect(screen.getByRole('header', { name: 'Início' })).toBeOnTheScreen();
      expect(screen.queryByText('Termine de configurar')).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'dica da primeira visita: some ao fechar, fica vista no servidor e conclui "Conhecer o app"',
    async () => {
      const vista = onboarding({ tour: 'concluida' }, { dicasVistas: ['transacoes.selecao'] });
      const pedidos = api(onboarding(), () => ({ status: 200, corpo: vista }));
      entrar(true);
      const { unmount } = renderRouter(ROTAS, { initialUrl: '/transacoes' });

      expect(
        await screen.findByText(
          'Segure um lançamento para selecionar vários e mudar a categoria ou excluir de uma vez.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Entendi' }));
      await waitFor(() => {
        expect(screen.queryByTestId('dica-transacoes.selecao')).toBeNull();
      });
      await waitFor(() => {
        expect(patches(pedidos)[0]?.corpo).toEqual({
          dicasVistas: ['transacoes.selecao'],
          etapas: { tour: 'concluida' },
        });
      });
      unmount();

      api(vista);
      renderRouter(ROTAS, { initialUrl: '/transacoes' });
      expect(await screen.findByRole('header', { name: 'Transações' }, ESPERA)).toBeOnTheScreen();
      await waitFor(() => {
        expect(screen.queryByText(/Segure um lançamento/)).toBeNull();
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'permissões pela aba Mais: "Pronto" conclui o passo pendente',
    async () => {
      const pedidos = api(onboarding());
      entrar(true);
      renderRouter(ROTAS, { initialUrl: '/mais/permissoes' });

      expect(await screen.findByRole('header', { name: 'Permissões' }, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Pronto' }));
      await waitFor(() => {
        expect(patches(pedidos)[0]?.corpo).toEqual({ etapas: { permissoes: 'concluida' } });
      });
    },
    TEMPO_LIMITE_MS,
  );
});
