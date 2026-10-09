import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/auditoria')({
  component: () => <SecaoProvisoria secao="auditoria" />,
});
