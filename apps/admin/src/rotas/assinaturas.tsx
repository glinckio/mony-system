import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/assinaturas')({
  component: () => <SecaoProvisoria secao="assinaturas" />,
});
