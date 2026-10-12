import { create } from 'zustand';

interface EstadoAtualizacao {
  /** A API recusou esta versão (426) ou ela está abaixo da mínima do `GET /config-app`. */
  obrigatoria: boolean;
  /** A versão mínima da plataforma, quando a API disse qual é. */
  versaoMinima: string | null;
  exigir: (versaoMinima: string | null) => void;
}

/**
 * Atualização obrigatória (T-056). Só em memória: a próxima abertura confere de novo, e a versão
 * nova instalada não fica presa na tela.
 */
export const useAtualizacao = create<EstadoAtualizacao>()((definir) => ({
  obrigatoria: false,
  versaoMinima: null,
  exigir: (versaoMinima) => {
    definir({ obrigatoria: true, versaoMinima });
  },
}));
