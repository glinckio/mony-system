import type { UsuarioSessao } from '@/stores/sessao';

/** Grupo de rotas que o usuário pode ver: `(auth)`, `(onboarding)` ou `(tabs)`. */
export type Destino = 'auth' | 'onboarding' | 'tabs';

/** Sem sessão vai para o login; com sessão, para o onboarding até concluí-lo, depois para as abas. */
export function destinoDaSessao(usuario: UsuarioSessao | null): Destino {
  if (usuario === null) return 'auth';
  return usuario.onboardingConcluido ? 'tabs' : 'onboarding';
}
