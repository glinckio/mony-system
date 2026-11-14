import { createFileRoute } from '@tanstack/react-router';

import { PaginaDocumento } from '@/legal/pagina-documento';
import { PRIVACIDADE } from '@/legal/privacidade';

/** Política de Privacidade, pública (T-140g): fora do `_painel`, sem login. */
export const Route = createFileRoute('/privacidade')({
  component: () => <PaginaDocumento documento={PRIVACIDADE} />,
});
