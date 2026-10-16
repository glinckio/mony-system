import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { configurarApi, criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin, guardarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

const ADMIN = { id: '00000000-0000-4000-8000-000000000001', nome: 'Ana Admin' };

const PARAMETROS = {
  alertas: {
    cotaConsultoriaDiaria: 3,
    intervaloAppCompraHoras: 24,
    foraDoPadrao: { multiplo: 3, minimoDeLancamentos: 5, valorMinimoCentavos: 5_000 },
  },
  ligacoes: { limiteMensal: 10 },
  versaoMinima: { ios: '1.0.0', android: '1.0.0' },
  monitoramento: { custoIaDiarioCentavos: 5_000, filaParadaMinutos: 15 },
  retencao: { diasArquivos: 90 },
};

const urlDe = (entrada: Parameters<typeof fetch>[0]) =>
  typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

const resposta = (corpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(corpo), { status }));

function api() {
  const salvos: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((entrada, init) => {
      const url = urlDe(entrada);
      if (url.includes('/admin/configuracoes') && init?.method === 'PUT') {
        const corpo: unknown = JSON.parse(init.body as string);
        salvos.push(corpo);
        return resposta({
          parametros: corpo,
          alteradoEm: '2026-10-16T14:00:00.000Z',
          alteradoPor: { id: ADMIN.id, nome: ADMIN.nome },
        });
      }
      if (url.includes('/admin/configuracoes')) {
        return resposta({ parametros: PARAMETROS, alteradoEm: null, alteradoPor: null });
      }
      return resposta({}, 404);
    }),
  );
  return salvos;
}

function abrir() {
  const clienteConsultas = criarClienteConsultas();
  clienteConsultas.setDefaultOptions({ queries: { retry: false } });
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: ['/configuracoes'] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
}

/** A primeira espera paga o carregamento da rota; no CI isso passou dos 5 s padrão. */
const cota = () =>
  screen.findByLabelText('Alertas de consultoria por dia', undefined, { timeout: 15_000 });

async function trocar(rotulo: string, valor: string) {
  const campo = screen.getByLabelText(rotulo);
  await userEvent.clear(campo);
  await userEvent.type(campo, valor);
}

describe('Configurações (T-141g, T-142a)', () => {
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

  it('mostra os padrões e salva os novos valores, com o valor mínimo em centavos', async () => {
    const salvos = api();
    abrir();
    expect(await cota()).toHaveValue('3');
    expect(screen.getByText('Ninguém mudou ainda: valem os padrões.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor mínimo (R$)')).toHaveValue('50,00');

    await trocar('Alertas de consultoria por dia', '5');
    await trocar('Valor mínimo (R$)', '80,50');
    await trocar('Versão mínima no Android', '2.3.0');
    expect(screen.getByLabelText('Custo de IA por dia (US$)')).toHaveValue('50,00');
    await trocar('Custo de IA por dia (US$)', '120,00');
    await trocar('Fila parada depois de (minutos)', '30');
    await trocar('Apagar arquivos depois de (dias)', '180');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Configurações salvas.');
    expect(salvos).toEqual([
      {
        ...PARAMETROS,
        alertas: {
          ...PARAMETROS.alertas,
          cotaConsultoriaDiaria: 5,
          foraDoPadrao: { ...PARAMETROS.alertas.foraDoPadrao, valorMinimoCentavos: 8_050 },
        },
        versaoMinima: { ios: '1.0.0', android: '2.3.0' },
        monitoramento: { custoIaDiarioCentavos: 12_000, filaParadaMinutos: 30 },
        retencao: { diasArquivos: 180 },
      },
    ]);
    expect(screen.getByText(/por Ana Admin/)).toBeInTheDocument();
  });

  it('campo fora do formato não vai para a API', async () => {
    const salvos = api();
    abrir();
    await cota();
    await trocar('Alertas de consultoria por dia', '0');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Confira os campos');
    await trocar('Alertas de consultoria por dia', '3');
    await trocar('Versão mínima no iOS', '1.2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Confira os campos');
    await trocar('Versão mínima no iOS', '1.2.0');
    await trocar('Fila parada depois de (minutos)', '2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Confira os campos');
    await trocar('Fila parada depois de (minutos)', '15');
    await trocar('Apagar arquivos depois de (dias)', '7');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Confira os campos');
    expect(salvos).toEqual([]);
  });
});
