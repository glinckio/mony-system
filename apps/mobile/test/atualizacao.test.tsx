import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { useAtualizacao } from '@/stores/atualizacao';
import { useSessao } from '@/stores/sessao';

const ROTAS = path.resolve(__dirname, '../app');
const ESPERA = { timeout: 10_000 };
const TEMPO_LIMITE_MS = 30_000;

const RECUSADA = {
  erro: {
    codigo: 'VERSAO_APP_DESATUALIZADA',
    mensagem: 'Atualize o app para continuar usando o Mony.',
    detalhes: { plataforma: 'ios', versaoMinima: '1.2.0' },
  },
};

/** API falsa: a versão mínima do `GET /config-app` e, opcionalmente, 426 em toda outra rota. */
function api(minima: string, recusarTudo = false) {
  const rotas: string[] = [];
  globalThis.fetch = jest.fn<typeof fetch>((url) => {
    const endereco = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const rota = new URL(endereco).pathname;
    rotas.push(rota);
    if (rota === '/v1/config-app') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            versaoMinima: { ios: minima, android: minima },
            flags: {},
            sugestoesChat: [],
          }),
          { status: 200 },
        ),
      );
    }
    return Promise.resolve(
      recusarTudo
        ? new Response(JSON.stringify(RECUSADA), { status: 426 })
        : new Response(null, { status: 404 }),
    );
  });
  return rotas;
}

describe('atualização obrigatória (T-056)', () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    useSessao.getState().encerrar();
    useAtualizacao.setState({ obrigatoria: false, versaoMinima: null });
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  it(
    'abaixo da versão mínima do config-app, só a atualização abre, com o botão da loja',
    async () => {
      const rotas = api('9.0.0');
      const abrir = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      renderRouter(ROTAS, { initialUrl: '/' });

      expect(
        await screen.findByRole('header', { name: 'Atualize o Monitorizze' }, ESPERA),
      ).toBeOnTheScreen();
      expect(rotas).toContain('/v1/config-app');
      expect(screen.getByText('Sua versão: 0.1.0 · mínima: 9.0.0')).toBeOnTheScreen();
      expect(screen.queryByRole('tab')).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Atualizar agora' }));
      // Sem o número do app na App Store (só na publicação), abre a busca pelo nome.
      expect(abrir).toHaveBeenCalledWith('https://apps.apple.com/br/search?term=Monitorizze');
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'versão em dia segue para o app',
    async () => {
      api('0.0.1');
      renderRouter(ROTAS, { initialUrl: '/' });
      expect(
        await screen.findByRole('header', { name: 'Seu dinheiro numa conversa' }, ESPERA),
      ).toBeOnTheScreen();
      await waitFor(() => {
        expect(jest.mocked(globalThis.fetch)).toHaveBeenCalled();
      });
      expect(screen.queryByText('Atualize o Monitorizze')).toBeNull();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'um 426 em qualquer chamada, já logado, troca o app pela atualização',
    async () => {
      api('0.0.1', true);
      useSessao.getState().iniciar({ id: 'u1', nome: 'Ana', onboardingConcluido: true }, 'acesso');
      renderRouter(ROTAS, { initialUrl: '/' });

      expect(
        await screen.findByRole('header', { name: 'Atualize o Monitorizze' }, ESPERA),
      ).toBeOnTheScreen();
      expect(screen.getByText('Sua versão: 0.1.0 · mínima: 1.2.0')).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );

  it(
    'loja que não abre mostra onde procurar',
    async () => {
      api('9.0.0');
      jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('sem loja'));
      renderRouter(ROTAS, { initialUrl: '/' });
      fireEvent.press(await screen.findByRole('button', { name: 'Atualizar agora' }, ESPERA));
      expect(
        await screen.findByText(
          'Não foi possível abrir a loja. Procure "Monitorizze" na loja do aparelho.',
          {},
          ESPERA,
        ),
      ).toBeOnTheScreen();
    },
    TEMPO_LIMITE_MS,
  );
});
