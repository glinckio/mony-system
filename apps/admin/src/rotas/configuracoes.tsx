import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/configuracoes')({
  component: () => <SecaoProvisoria secao="configuracoes" />,
});
