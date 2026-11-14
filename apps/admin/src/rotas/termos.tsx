import { createFileRoute } from '@tanstack/react-router';

import { PaginaDocumento } from '@/legal/pagina-documento';
import { TERMOS } from '@/legal/termos';

/** Termos de Uso, públicos (T-140g): fora do `_painel`, sem login. */
export const Route = createFileRoute('/termos')({
  component: () => <PaginaDocumento documento={TERMOS} />,
});
