import { createFileRoute } from '@tanstack/react-router';

import { EXCLUSAO_CONTA } from '@/legal/exclusao-conta';
import { PaginaDocumento } from '@/legal/pagina-documento';

/** Como excluir a conta, pública (T-146b): o link da Segurança dos dados no Google Play. */
export const Route = createFileRoute('/excluir-conta')({
  component: () => <PaginaDocumento documento={EXCLUSAO_CONTA} />,
});
