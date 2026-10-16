import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };
const USUARIO = '00000000-0000-4000-8000-000000000201';

const resumo = (versao: number, extra: object = {}) => ({
  versao,
  ativa: false,
  modelo: 'claude-modelo',
  criadoEm: '2026-10-15T15:00:00.000Z',
  criadoPor: { id: ADMIN.id, nome: 'Ana Admin' },
  situacaoAvaliacao: 'nunca',
  avaliacao: null,
  podeAtivar: false,
  ...extra,
});

const AVALIACAO = {
  total: 40,
  aprovados: 39,
  percentual: 97,
  modelo: 'claude-modelo',
  em: '2026-10-15T16:00:00.000Z',
};
const ATIVA = resumo(2, {
  ativa: true,
  situacaoAvaliacao: 'concluida',
  avaliacao: { ...AVALIACAO, total: 40, aprovados: 40, percentual: 100 },
});
const APROVADA = resumo(3, {
  situacaoAvaliacao: 'concluida',
  avaliacao: AVALIACAO,
  podeAtivar: true,
});
const RODANDO = resumo(4, { situacaoAvaliacao: 'em_andamento' });

const DETALHE_ATIVA = {
  ...ATIVA,
  promptSistema: 'Você é a Mony.',
  descricoes: { resumo_periodo: 'Totais do período.' },
  avaliacaoFalha: null,
  casos: [
    { id: 'gasto-simples', passou: true, motivos: [] },
    { id: 'parcelado', passou: false, motivos: ['faltou criar_transacao'] },
  ],
};

const CUSTO = {
  de: '2026-10-01',
  ate: '2026-10-16',
  modelos: [
    {
      modelo: 'claude-modelo',
      chamadas: 1200,
      tokensEntrada: 3_000_000,
      tokensSaida: 400_000,
      custoCentavos: 1500,
    },
    {
      modelo: 'modelo-novo',
      chamadas: 3,
      tokensEntrada: 100,
      tokensSaida: 50,
      custoCentavos: null,
    },
  ],
  totalCentavos: 1500,
  chamadas: 1203,
  chamadasComErro: 7,
  modelosSemPreco: ['modelo-novo'],
};

const PRECOS = {
  precos: [
    { modelo: 'claude-modelo', entradaCentavosPorMilhao: 300, saidaCentavosPorMilhao: 1500 },
  ],
};

const LOGS = {
  itens: [
    {
      id: '00000000-0000-4000-8000-000000000901',
      usuario: { id: USUARIO, nome: 'Bruno Lima', email: 'bruno@teste.com' },
      modelo: 'claude-modelo',
      ferramenta: 'criar_transacao',
      duracaoMs: 12_300,
      erro: 'overloaded_error',
      mensagem: 'gastei 50 no mercado',
      criadoEm: '2026-10-16T13:00:00.000Z',
    },
  ],
  proximoCursor: null,
};

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));

function api(opcoes: { avaliacaoDisponivel?: boolean } = {}) {
  const pedidos: { metodo: string; url: string; corpo?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, init) => {
      const url = urlDe(entrada);
      const metodo = init?.method ?? 'GET';
      const corpo: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      pedidos.push({ metodo, url, ...(corpo === undefined ? {} : { corpo }) });
      const caminho = url.split('?')[0] ?? '';
      if (metodo === 'GET' && caminho.endsWith('/admin/mony/versoes')) {
        return resposta({
          itens: [RODANDO, APROVADA, ATIVA],
          versaoAtiva: 2,
          minimoAvaliacao: 95,
          avaliacaoDisponivel: opcoes.avaliacaoDisponivel ?? true,
        });
      }
      if (metodo === 'GET' && /\/admin\/mony\/versoes\/\d+$/.test(caminho)) {
        const versao = Number(caminho.split('/').at(-1));
        return resposta(
          versao === 2 ? DETALHE_ATIVA : { ...DETALHE_ATIVA, ...resumo(versao), casos: [] },
        );
      }
      if (metodo === 'POST' && caminho.endsWith('/admin/mony/versoes')) {
        return resposta({ ...DETALHE_ATIVA, ...resumo(5), casos: [] }, 201);
      }
      if (metodo === 'POST' && caminho.endsWith('/avaliar')) {
        return resposta(
          { ...DETALHE_ATIVA, ...resumo(3, { situacaoAvaliacao: 'em_andamento' }) },
          202,
        );
      }
      if (caminho.endsWith('/admin/mony/custo')) return resposta(CUSTO);
      if (caminho.endsWith('/admin/mony/precos')) return resposta(corpo ?? PRECOS);
      if (caminho.endsWith('/admin/mony/logs')) return resposta(LOGS);
      return resposta({}, 404);
    }),
  );
  return pedidos;
}

function abrir() {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: ['/mony'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

/** A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão. */
const versoes = () =>
  screen.findByRole('table', { name: 'Versões do prompt' }, { timeout: 15_000 });

describe('Mony (T-141e)', () => {
  beforeEach(() => {
    configurarApi('');
    guardarSessaoAdmin({
      admin: { ...ADMIN, email: 'ana@teste.com' },
      token: 'token-admin',
      expiraEm: new Date(Date.now() + 15 * 60_000).toISOString(),
    });
  });

  afterEach(() => {
    encerrarSessaoAdmin();
    vi.unstubAllGlobals();
  });

  it('lista as versões com a avaliação; a ativa abre com o prompt e as frases que falharam', async () => {
    api();
    abrir();
    const tabela = await versoes();
    const linhas = within(tabela).getAllByRole('row');
    expect(linhas[1]).toHaveTextContent('Avaliando…');
    expect(linhas[2]).toHaveTextContent('97% (39 de 40)');
    expect(linhas[3]).toHaveTextContent('2 · ativa');
    expect(screen.getByText(/Versão ativa: 2\./)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Ativar a versão 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ativar a versão 2' })).toBeNull();
    // A que está rodando não pode ser pedida de novo.
    expect(screen.queryByRole('button', { name: 'Avaliar a versão 4' })).toBeNull();

    expect(await screen.findByDisplayValue('Você é a Mony.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Frases que falharam (1)' })).toHaveTextContent(
      'parcelado: faltou criar_transacao',
    );
  });

  it('salva o prompt editado como versão nova e pede a avaliação', async () => {
    const pedidos = api();
    abrir();
    await versoes();
    const prompt = await screen.findByLabelText('Prompt do sistema');
    await userEvent.type(prompt, ' Seja breve.');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar como nova versão' }));
    await screen.findByText('Versão 5');
    expect(
      pedidos.find(({ metodo, url }) => metodo === 'POST' && url.endsWith('/versoes')),
    ).toEqual({
      metodo: 'POST',
      url: '/v1/admin/mony/versoes',
      corpo: {
        promptSistema: 'Você é a Mony. Seja breve.',
        descricoes: { resumo_periodo: 'Totais do período.' },
        modelo: 'claude-modelo',
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Avaliar a versão 3' }));
    expect(await screen.findByText(/Avaliação pedida/)).toBeInTheDocument();
    expect(
      pedidos.some(
        ({ metodo, url }) => metodo === 'POST' && url === '/v1/admin/mony/versoes/3/avaliar',
      ),
    ).toBe(true);
  });

  it('sem modelo de verdade, avisa e não oferece avaliar', async () => {
    api({ avaliacaoDisponivel: false });
    abrir();
    await versoes();
    expect(screen.getByText(/usa o modelo falso/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Avaliar a versão/ })).toBeNull();
  });

  it('mostra o custo do período, avisa o modelo sem preço e salva o preço dele', async () => {
    const pedidos = api();
    abrir();
    expect(
      await screen.findByText('US$ 15,00 em 1.203 chamadas (7 com erro)', {}, { timeout: 15_000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sem preço na tabela, fora do total: modelo-novo/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('table', { name: 'Custo por modelo' })).getByText('sem preço'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar modelo-novo' }));
    await userEvent.type(
      screen.getByLabelText('Entrada (US$/M)', { selector: '#preco-entrada-1' }),
      '0,80',
    );
    await userEvent.type(
      screen.getByLabelText('Saída (US$/M)', { selector: '#preco-saida-1' }),
      '4',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Salvar preços' }));
    expect(await screen.findByText('Preços salvos.')).toBeInTheDocument();
    expect(pedidos.find(({ metodo }) => metodo === 'PUT')?.corpo).toEqual({
      precos: [
        { modelo: 'claude-modelo', entradaCentavosPorMilhao: 300, saidaCentavosPorMilhao: 1500 },
        { modelo: 'modelo-novo', entradaCentavosPorMilhao: 80, saidaCentavosPorMilhao: 400 },
      ],
    });
  });

  it('lista as chamadas com erro com a mensagem e o link para a conta', async () => {
    api();
    abrir();
    const tabela = await screen.findByRole(
      'table',
      { name: 'Chamadas com erro' },
      { timeout: 15_000 },
    );
    expect(tabela).toHaveTextContent('gastei 50 no mercado');
    expect(tabela).toHaveTextContent('overloaded_error');
    expect(tabela).toHaveTextContent('12,3 s');
    expect(within(tabela).getByRole('link', { name: 'Bruno Lima' })).toHaveAttribute(
      'href',
      `/usuarios/${USUARIO}`,
    );
  });
});
