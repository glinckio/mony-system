import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/planos')({
  component: () => <SecaoProvisoria secao="planos" />,
});
