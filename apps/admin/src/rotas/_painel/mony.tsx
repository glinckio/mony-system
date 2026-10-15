import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/_painel/mony')({
  component: () => <SecaoProvisoria secao="mony" />,
});
