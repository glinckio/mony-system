import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 60_000;

const PERFIL = {
  id: '0199a000-0000-7000-8000-000000000001',
  nome: 'Ana Souza',
  email: 'ana@exemplo.com',
  telefone: '+5511987654321',
  telefoneVerificado: false,
  fotoUrl: null,
  fusoHorario: 'America/Sao_Paulo',
  onboardingConcluido: true,
  temSenha: true,
  loginsSociais: [],
  criadoEm: '2026-10-01T12:00:00.000Z',
};

interface Pedido {
  metodo: string;
  rota: string;
  corpo: Record<string, unknown>;
}

const EXPORTACAO = {
  id: '0199a000-0000-7000-8000-0000000000e1',
  status: 'processando',
  url: null,
  expiraEm: null,
  criadoEm: '2026-10-16T12:00:00.000Z',
  concluidaEm: null,
};
const URL_DADOS = 'https://arquivos.teste/exportacoes/dados/x.zip';

function api() {
  const pedidos: Pedido[] = [];
  let perfil = PERFIL;
  let consultasExportacao = 0;
  let exportacao: Record<string, unknown> | null = null;
  globalThis.fetch = jest.fn<typeof fetch>((url, opcoes) => {
    const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const pedido = {
      metodo: opcoes?.method ?? 'GET',
      rota: new URL(endereco).pathname,
      corpo: (typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : {}) as Record<
        string,
        unknown
      >,
    };
    pedidos.push(pedido);
    if (pedido.rota === '/v1/me' && pedido.metodo === 'PATCH') {
      perfil = { ...perfil, ...pedido.corpo };
      return Promise.resolve(new Response(JSON.stringify(perfil), { status: 200 }));
    }
    if (pedido.rota === '/v1/me/exportar' && pedido.metodo === 'POST') {
      exportacao = EXPORTACAO;
      return Promise.resolve(new Response(JSON.stringify(exportacao), { status: 202 }));
    }
    if (pedido.rota === '/v1/me/exportar') {
      // Depois do pedido, a segunda consulta já encontra o arquivo pronto.
      if (exportacao !== null) consultasExportacao += 1;
      if (consultasExportacao >= 1 && exportacao !== null) {
        exportacao = {
          ...EXPORTACAO,
          status: 'pronta',
          url: URL_DADOS,
          expiraEm: '2026-10-17T12:00:00.000Z',
          concluidaEm: '2026-10-16T12:00:05.000Z',
        };
      }
      return Promise.resolve(new Response(JSON.stringify({ exportacao }), { status: 200 }));
    }
    if (pedido.rota === '/v1/me') {
      return Promise.resolve(new Response(JSON.stringify(perfil), { status: 200 }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return pedidos;
}

const patches = (pedidos: Pedido[]) => pedidos.filter(({ metodo }) => metodo === 'PATCH');

describe('aba Mais e Perfil (T-057)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().encerrar();
    useSessao
      .getState()
      .iniciar({ id: PERFIL.id, nome: 'Ana Souza', onboardingConcluido: true }, 'acesso');
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'aba Mais: o perfil, a grade com as telas que existem e as configurações',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/mais' });

      expect(await screen.findByRole('header', { name: 'Mais' }, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('AS')).toBeOnTheScreen();
      for (const atalho of ['Orçamentos', 'Metas', 'Relatórios', 'Categorias', 'Contas']) {
        expect(screen.getByRole('button', { name: atalho })).toBeOnTheScreen();
      }
      fireEvent.press(screen.getByRole('button', { name: 'Perfil e configurações de Ana Souza' }));
      expect(await screen.findByRole('header', { name: 'Perfil' }, ESPERA)).toBeOnTheScreen();
      expect(await screen.findByText('ana@exemplo.com', {}, ESPERA)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Permissões e apps de compra' }));
      expect(await screen.findByRole('header', { name: 'Permissões' }, ESPERA)).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-001 dados pessoais: valida o celular, manda só o que mudou e o nome vai para o app',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByRole('button', { name: 'Dados pessoais' }, ESPERA));

      const nome = await screen.findByLabelText('Nome', {}, ESPERA);
      expect(nome).toHaveDisplayValue('Ana Souza');
      expect(screen.getByLabelText('Celular com DDD')).toHaveDisplayValue('(11) 98765-4321');
      expect(screen.getByLabelText('E-mail')).toBeDisabled();

      fireEvent.changeText(screen.getByLabelText('Celular com DDD'), '123');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(
        await screen.findByText('Informe um celular com DDD, ex.: (11) 98765-4321.', {}, ESPERA),
      ).toBeOnTheScreen();
      expect(patches(pedidos)).toEqual([]);

      fireEvent.changeText(screen.getByLabelText('Celular com DDD'), '11 98765-4321');
      fireEvent.changeText(nome, 'Ana Lima');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() => {
        expect(patches(pedidos)[0]?.corpo).toEqual({ nome: 'Ana Lima' });
      }, ESPERA);
      expect(await screen.findByRole('header', { name: 'Perfil' }, ESPERA)).toBeOnTheScreen();
      expect(useSessao.getState().usuario?.nome).toBe('Ana Lima');
      expect(screen.getByText('AL')).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    '"Rever tutorial" mostra as boas-vindas e volta ao Perfil, sem as permissões',
    async () => {
      api();
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByRole('button', { name: 'Rever tutorial' }, ESPERA));

      expect(
        await screen.findByRole('header', { name: 'Registre gastos só conversando' }, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByRole('progressbar', { name: 'Etapa 1 de 2' })).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
      expect(
        await screen.findByRole('header', { name: 'Avisos antes do aperto' }, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Entendi' }));
      expect(await screen.findByRole('header', { name: 'Perfil' }, ESPERA)).toBeOnTheScreen();
      expect(
        screen.queryByRole('header', { name: 'Deixe a Mony te avisar na hora certa' }),
      ).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-160 exportar meus dados: pede, espera o worker e abre o link do arquivo',
    async () => {
      const pedidos = api();
      const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByRole('button', { name: 'Exportar meus dados' }, ESPERA));
      fireEvent.press(await screen.findByRole('button', { name: 'Pedir meus dados' }, ESPERA));

      expect(
        await screen.findByText(
          'Juntando seus dados… Pode fechar: avisamos por e-mail quando ficar pronto.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
      expect(
        pedidos.filter(({ metodo, rota }) => metodo === 'POST' && rota === '/v1/me/exportar'),
      ).toHaveLength(1);
      fireEvent.press(await screen.findByRole('button', { name: 'Baixar meus dados' }, ESPERA));
      expect(abrir).toHaveBeenCalledWith(URL_DADOS);
    },
    TEMPO_LIMITE_MS,
  );
});
