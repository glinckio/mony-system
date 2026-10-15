import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { ContextoRotas } from '@/roteador';

export const Route = createRootRouteWithContext<ContextoRotas>()({
  component: Outlet,
  notFoundComponent: NaoEncontrada,
});

function NaoEncontrada() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t('comum.naoEncontrada')}</h1>
      <Button asChild variant="outline">
        <Link to="/">{t('comum.voltarAoInicio')}</Link>
      </Button>
    </div>
  );
}
