import { create } from 'zustand';

/** Dados do usuário que decidem a navegação. */
export interface UsuarioSessao {
  id: string;
  nome: string;
  onboardingConcluido: boolean;
}

/**
 * - `iniciando`: o app ainda procura a sessão guardada no aparelho;
 * - `bloqueada`: há sessão guardada, mas a biometria precisa liberar (RN-005);
 * - `pronta`: com ou sem usuário, a navegação já pode decidir a tela.
 */
export type EstadoDaSessao = 'iniciando' | 'bloqueada' | 'pronta';

interface EstadoSessao {
  estado: EstadoDaSessao;
  usuario: UsuarioSessao | null;
  /** Token de acesso (15 min). Só em memória; o de renovação fica no cofre do aparelho. */
  tokenAcesso: string | null;
  iniciar: (usuario: UsuarioSessao, tokenAcesso: string | null) => void;
  encerrar: () => void;
  definirEstado: (estado: EstadoDaSessao) => void;
  /** O onboarding terminou no servidor: a navegação passa para as abas. */
  concluirOnboarding: () => void;
}

export const useSessao = create<EstadoSessao>()((definir) => ({
  estado: 'iniciando',
  usuario: null,
  tokenAcesso: null,
  iniciar: (usuario, tokenAcesso) => {
    definir({ usuario, tokenAcesso, estado: 'pronta' });
  },
  encerrar: () => {
    definir({ usuario: null, tokenAcesso: null, estado: 'pronta' });
  },
  definirEstado: (estado) => {
    definir({ estado });
  },
  concluirOnboarding: () => {
    definir(({ usuario }) =>
      usuario ? { usuario: { ...usuario, onboardingConcluido: true } } : {},
    );
  },
}));
