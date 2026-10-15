import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/_painel/auditoria')({
  component: () => <SecaoProvisoria secao="auditoria" />,
});
