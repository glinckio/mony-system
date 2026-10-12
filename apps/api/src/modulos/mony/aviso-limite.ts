import { LINKS_INTERNOS } from '@mony/shared/alertas';
import type { ComponenteMony } from '@mony/shared/mony';

import { ehErroDeLimite } from '../planos/dominio/cotas';

/** Id do botão [Ver planos] nos componentes da Mony. */
export const ID_VER_PLANOS = 'ver-planos';

/** RN-123: o botão [Ver planos], que só abre a tela do plano no app. */
export function botaoVerPlanos(): ComponenteMony {
  return {
    tipo: 'botoes',
    opcoes: [
      {
        id: ID_VER_PLANOS,
        rotulo: 'Ver planos',
        acao: { tipo: 'abrir', link: LINKS_INTERNOS.planos() },
      },
    ],
  };
}

/** O componente é o [Ver planos]? (para não repetir o botão na mesma resposta). */
export function ehVerPlanos(componente: ComponenteMony): boolean {
  return componente.tipo === 'botoes' && componente.opcoes.some(({ id }) => id === ID_VER_PLANOS);
}

/**
 * RN-123: com o limite do gratuito atingido, a Mony avisa o que acabou e quando volta, com o
 * [Ver planos]. `null`: o erro é outro.
 */
export function avisoDoLimite(
  erro: unknown,
): { texto: string; componente: ComponenteMony; transacaoId: null } | null {
  if (!ehErroDeLimite(erro)) return null;
  return { texto: erro.message, componente: botaoVerPlanos(), transacaoId: null };
}
