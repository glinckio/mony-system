import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/metricas')({
  component: () => <SecaoProvisoria secao="metricas" />,
});
