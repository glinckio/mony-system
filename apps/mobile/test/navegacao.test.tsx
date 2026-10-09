import path from 'node:path';

import { beforeEach, describe, expect, it } from '@jest/globals';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { useSessao } from '@/stores/sessao';

/** As rotas de verdade do app, com o `_layout.tsx` raiz e seus providers. */
const ROTAS = path.resolve(__dirname, '../app');

const ABAS = ['Início', 'Transações', 'Mony', 'Cartões', 'Mais'];

function entrar(onboardingConcluido: boolean) {
  useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido }, 'token');
}

describe('navegação pela sessão', () => {
  beforeEach(() => {
    useSessao.getState().encerrar();
  });

  it('sem sessão abre o login, mesmo pedindo outra rota', () => {
    const app = renderRouter(ROTAS, { initialUrl: '/cartoes' });
    expect(screen.getByRole('header', { name: 'Entrar' })).toBeOnTheScreen();
    expect(app.getSegments()).toEqual(['(auth)']);
  });

  it('com onboarding pendente abre as boas-vindas', () => {
    entrar(false);
    const app = renderRouter(ROTAS, { initialUrl: '/' });
    expect(screen.getByRole('header', { name: 'Boas-vindas' })).toBeOnTheScreen();
    expect(app.getSegments()).toEqual(['(onboarding)']);
  });

  it('com onboarding concluído abre o Início, com as cinco abas', () => {
    entrar(true);
    const app = renderRouter(ROTAS, { initialUrl: '/' });
    expect(screen.getByRole('header', { name: 'Início' })).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
    for (const aba of ABAS) {
      expect(screen.getByRole('button', { name: aba })).toBeOnTheScreen();
    }
  });

  it('cada aba abre a sua tela', () => {
    entrar(true);
    const app = renderRouter(ROTAS, { initialUrl: '/' });
    const caminhos = ['/', '/transacoes', '/mony', '/cartoes', '/mais'];
    ABAS.forEach((aba, indice) => {
      fireEvent.press(screen.getByRole('button', { name: aba }));
      expect(app.getPathname()).toBe(caminhos[indice] ?? '');
      expect(screen.getByRole('header', { name: aba })).toBeOnTheScreen();
    });
  });

  it('ao sair, volta para o login', () => {
    entrar(true);
    renderRouter(ROTAS, { initialUrl: '/mony' });
    expect(screen.getByRole('header', { name: 'Mony' })).toBeOnTheScreen();
    act(() => {
      useSessao.getState().encerrar();
    });
    expect(screen.getByRole('header', { name: 'Entrar' })).toBeOnTheScreen();
  });

  it('em desenvolvimento, o atalho do login abre as abas', () => {
    renderRouter(ROTAS, { initialUrl: '/' });
    fireEvent.press(screen.getByRole('button', { name: 'Ver o app sem entrar (desenvolvimento)' }));
    expect(screen.getByRole('header', { name: 'Início' })).toBeOnTheScreen();
  });

  it('rota inexistente mostra a tela de não encontrada', () => {
    entrar(true);
    renderRouter(ROTAS, { initialUrl: '/nao-existe' });
    expect(screen.getByRole('header', { name: 'Página não encontrada' })).toBeOnTheScreen();
  });
});
