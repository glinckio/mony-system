import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/_painel/filas')({
  component: () => <SecaoProvisoria secao="filas" />,
});
