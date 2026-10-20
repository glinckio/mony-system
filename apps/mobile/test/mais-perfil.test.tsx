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
/** 23/10 às 12:00 em São Paulo. */
const EXCLUSAO_EM = '2026-10-23T15:00:00.000Z';

function api(opcoes: { temSenha?: boolean; agendadaPara?: string | null } = {}) {
  const pedidos: Pedido[] = [];
  let perfil = { ...PERFIL, temSenha: opcoes.temSenha ?? true };
  let agendadaPara = opcoes.agendadaPara ?? null;
  let consultasExportacao = 0;
  let consentimentos: {
    finalidade: string;
    concedido: boolean;
    concedidoEm: string | null;
    revogadoEm: string | null;
  }[] = [
    { finalidade: 'open_finance', concedido: false, concedidoEm: null, revogadoEm: null },
    {
      finalidade: 'agenda',
      concedido: true,
      concedidoEm: '2026-10-05T15:00:00.000Z',
      revogadoEm: null,
    },
    { finalidade: 'apps_compra', concedido: false, concedidoEm: null, revogadoEm: null },
    {
      finalidade: 'ligacao',
      concedido: false,
      concedidoEm: '2026-10-01T15:00:00.000Z',
      revogadoEm: '2026-10-02T15:00:00.000Z',
    },
  ];
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
    if (pedido.rota === '/v1/consentimentos') {
      return Promise.resolve(
        new Response(JSON.stringify({ itens: consentimentos }), { status: 200 }),
      );
    }
    if (pedido.rota === '/v1/consentimentos/agenda' && pedido.metodo === 'DELETE') {
      consentimentos = consentimentos.map((item) =>
        item.finalidade === 'agenda'
          ? { ...item, concedido: false, revogadoEm: '2026-10-20T18:00:00.000Z' }
          : item,
      );
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (pedido.rota === '/v1/me/telefone/codigo') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (pedido.rota === '/v1/me/telefone/verificar') {
      if (pedido.corpo.codigo !== '123456') {
        const erro = { codigo: 'CODIGO_INVALIDO', mensagem: 'Código inválido ou expirado.' };
        return Promise.resolve(new Response(JSON.stringify({ erro }), { status: 400 }));
      }
      perfil = { ...perfil, telefoneVerificado: true };
      return Promise.resolve(new Response(JSON.stringify(perfil), { status: 200 }));
    }
    if (pedido.rota === '/v1/me/exclusao/codigo') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (pedido.rota === '/v1/me/exclusao') {
      if (pedido.metodo === 'POST') agendadaPara = EXCLUSAO_EM;
      if (pedido.metodo === 'DELETE') agendadaPara = null;
      return Promise.resolve(new Response(JSON.stringify({ agendadaPara }), { status: 200 }));
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
    'RN-078 dados pessoais: o celular não verificado recebe o código por SMS e fica verificado',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais/dados-pessoais' });
      fireEvent.press(await screen.findByRole('button', { name: 'Verificar celular' }, ESPERA));

      expect(
        await screen.findByText(/Enviamos um código por SMS para \(11\) 98765-4321/, {}, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Enviar código por SMS' }));
      fireEvent.changeText(
        await screen.findByLabelText('Código de 6 dígitos', {}, ESPERA),
        '654321',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Verificar' }));
      expect(await screen.findByText('Código inválido ou expirado.', {}, ESPERA)).toBeOnTheScreen();

      fireEvent.changeText(screen.getByLabelText('Código de 6 dígitos'), '123456');
      fireEvent.press(screen.getByRole('button', { name: 'Verificar' }));
      expect(await screen.findByText('Celular verificado.', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Verificar celular' })).toBeNull();
      expect(
        pedidos.filter(({ rota }) => rota.startsWith('/v1/me/telefone')).map(({ rota }) => rota),
      ).toEqual([
        '/v1/me/telefone/codigo',
        '/v1/me/telefone/verificar',
        '/v1/me/telefone/verificar',
      ]);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'LGPD autorizações nas Permissões: mostra cada uma e revoga a agenda depois de confirmar',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais/permissoes' });

      expect(await screen.findByText('Suas autorizações', {}, ESPERA)).toBeOnTheScreen();
      expect(await screen.findByText('Autorizado em 5/out', {}, ESPERA)).toBeOnTheScreen();
      expect(screen.getByText('Revogado em 2/out')).toBeOnTheScreen();
      expect(screen.getByText('Não autorizado')).toBeOnTheScreen();
      expect(screen.queryByText('Conexão com o banco (Open Finance)')).toBeNull();
      expect(screen.getAllByRole('button', { name: /^Revogar / })).toHaveLength(1);

      fireEvent.press(
        screen.getByRole('button', { name: 'Revogar Agenda do Google ou do Outlook' }),
      );
      expect(
        await screen.findByText(/As agendas conectadas são desconectadas/, {}, ESPERA),
      ).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Revogar autorização' }));
      expect(await screen.findByText('Revogado em 20/out', {}, ESPERA)).toBeOnTheScreen();
      expect(pedidos.filter(({ metodo }) => metodo === 'DELETE').map(({ rota }) => rota)).toEqual([
        '/v1/consentimentos/agenda',
      ]);
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

  it(
    'RN-161 excluir a conta com a senha: mostra a data e sai da conta',
    async () => {
      const pedidos = api();
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir conta' }, ESPERA));
      fireEvent.changeText(await screen.findByLabelText('Sua senha', {}, ESPERA), 'segredo123');
      fireEvent.press(screen.getByRole('button', { name: 'Excluir minha conta' }));

      expect(
        await screen.findByText(/Sua conta será excluída em 23\/out/, {}, ESPERA),
      ).toBeOnTheScreen();
      expect(
        pedidos.filter(({ metodo, rota }) => metodo === 'POST' && rota === '/v1/me/exclusao'),
      ).toEqual([{ metodo: 'POST', rota: '/v1/me/exclusao', corpo: { senha: 'segredo123' } }]);
      fireEvent.press(screen.getByRole('button', { name: 'Entendi' }));
      await waitFor(() => {
        expect(useSessao.getState().usuario).toBeNull();
      }, ESPERA);
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-161 sem senha, confirma com o código que vai por e-mail',
    async () => {
      const pedidos = api({ temSenha: false });
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(await screen.findByRole('button', { name: 'Excluir conta' }, ESPERA));
      fireEvent.press(
        await screen.findByRole('button', { name: 'Enviar código por e-mail' }, ESPERA),
      );
      fireEvent.changeText(
        await screen.findByLabelText('Código de 6 dígitos', {}, ESPERA),
        '004217',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Excluir minha conta' }));

      expect(
        await screen.findByText(/Sua conta será excluída em 23\/out/, {}, ESPERA),
      ).toBeOnTheScreen();
      expect(pedidos.map(({ metodo, rota }) => `${metodo} ${rota}`)).toContain(
        'POST /v1/me/exclusao/codigo',
      );
      expect(
        pedidos.find(({ metodo, rota }) => metodo === 'POST' && rota === '/v1/me/exclusao')?.corpo,
      ).toEqual({
        codigo: '004217',
      });
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'RN-161 com a exclusão agendada, desiste e tudo fica como estava',
    async () => {
      const pedidos = api({ agendadaPara: EXCLUSAO_EM });
      renderRouter(ROTAS, { initialUrl: '/mais/perfil' });
      fireEvent.press(
        await screen.findByRole('button', { name: 'Exclusão agendada para 23/out' }, ESPERA),
      );
      fireEvent.press(await screen.findByRole('button', { name: 'Desistir da exclusão' }, ESPERA));

      expect(
        await screen.findByRole('button', { name: 'Excluir conta' }, ESPERA),
      ).toBeOnTheScreen();
      expect(
        pedidos.filter(({ metodo, rota }) => metodo === 'DELETE' && rota === '/v1/me/exclusao'),
      ).toHaveLength(1);
    },
    TEMPO_LIMITE_MS,
  );
});
