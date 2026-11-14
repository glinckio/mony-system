import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { CAMPOS_ABERTOS } from './legal/campos';
import { criarClienteConsultas } from './lib/api';
import { encerrarSessaoAdmin } from './lib/sessao';
import { criarRoteador } from './roteador';

function abrir(caminho: string) {
  const clienteConsultas = criarClienteConsultas();
  const roteador = criarRoteador(
    clienteConsultas,
    createMemoryHistory({ initialEntries: [caminho] }),
  );
  render(<App clienteConsultas={clienteConsultas} roteador={roteador} />);
  return roteador;
}

afterEach(() => {
  encerrarSessaoAdmin();
  vi.unstubAllGlobals();
});

describe('termos e privacidade (T-140g)', () => {
  it('RN-007 os termos abrem sem login, com a versão que o app grava no aceite', async () => {
    const buscar = vi.fn();
    vi.stubGlobal('fetch', buscar);
    const roteador = abrir('/termos');

    expect(await screen.findByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeVisible();
    expect(roteador.state.location.pathname).toBe('/termos');
    expect(screen.getByText('Versão 1.0')).toBeVisible();
    expect(screen.getByRole('heading', { name: '10. Planos e limites' })).toBeVisible();
    // Os campos em aberto aparecem como o cliente deixou, até o lançamento.
    expect(
      screen.getByText(`Versão 1.0, vigente a partir de ${CAMPOS_ABERTOS.vigencia}.`),
    ).toBeVisible();
    // Página pública: não chama a API.
    expect(buscar).not.toHaveBeenCalled();
  });

  it('a política abre sem login e o menu leva de uma página à outra', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const roteador = abrir('/privacidade');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Política de Privacidade' }),
    ).toBeVisible();
    expect(screen.getByRole('cell', { name: CAMPOS_ABERTOS.paisTelefonia })).toBeVisible();
    expect(screen.getByText(/leonardo@monitorizze\.com\.br\. Suporte geral/)).toBeVisible();

    await userEvent.click(screen.getByRole('link', { name: 'Termos de Uso' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeVisible();
    expect(roteador.state.location.pathname).toBe('/termos');
  });
});
