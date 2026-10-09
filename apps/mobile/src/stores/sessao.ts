import { create } from 'zustand';

/** Dados do usuário que decidem a navegação. A T-030 preenche a partir da API. */
export interface UsuarioSessao {
  id: string;
  nome: string;
  onboardingConcluido: boolean;
}

interface EstadoSessao {
  usuario: UsuarioSessao | null;
  /** Token de acesso (15 min). Só em memória; o refresh fica no `expo-secure-store` (T-030). */
  tokenAcesso: string | null;
  iniciar: (usuario: UsuarioSessao, tokenAcesso: string | null) => void;
  encerrar: () => void;
}

export const useSessao = create<EstadoSessao>()((definir) => ({
  usuario: null,
  tokenAcesso: null,
  iniciar: (usuario, tokenAcesso) => {
    definir({ usuario, tokenAcesso });
  },
  encerrar: () => {
    definir({ usuario: null, tokenAcesso: null });
  },
}));
