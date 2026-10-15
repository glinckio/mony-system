import { createFileRoute } from '@tanstack/react-router';

import { SecaoProvisoria } from '@/components/secao-provisoria';

export const Route = createFileRoute('/_painel/configuracoes')({
  component: () => <SecaoProvisoria secao="configuracoes" />,
});
