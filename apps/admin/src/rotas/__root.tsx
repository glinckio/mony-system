import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { House } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { ContextoRotas } from '@/roteador';
import { ICONES_SECOES, SECOES } from '@/secoes';

export const Route = createRootRouteWithContext<ContextoRotas>()({
  component: Layout,
  notFoundComponent: NaoEncontrada,
});

const CLASSES_LINK =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent';
const CLASSES_ATIVO = 'bg-sidebar-accent font-medium text-sidebar-accent-foreground';

/** Menu lateral com as seções do doc 13 e a página da vez à direita. */
function Layout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-sidebar p-4">
        <p className="mb-4 px-3 font-semibold">{t('comum.produto')}</p>
        <nav aria-label={t('comum.menu')} className="flex flex-col gap-1">
          <Link
            to="/"
            className={CLASSES_LINK}
            activeProps={{ className: CLASSES_ATIVO }}
            activeOptions={{ exact: true }}
          >
            <House aria-hidden className="size-4" />
            {t('inicio.titulo')}
          </Link>
          {SECOES.map((secao) => {
            const Icone = ICONES_SECOES[secao];
            return (
              <Link
                key={secao}
                to={`/${secao}`}
                className={CLASSES_LINK}
                activeProps={{ className: CLASSES_ATIVO }}
              >
                <Icone aria-hidden className="size-4" />
                {t(`secoes.${secao}`)}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}

function NaoEncontrada() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">{t('comum.naoEncontrada')}</h1>
      <Button asChild variant="outline">
        <Link to="/">{t('comum.voltarAoInicio')}</Link>
      </Button>
    </div>
  );
}
