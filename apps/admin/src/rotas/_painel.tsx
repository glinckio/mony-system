import { createFileRoute, Link, Navigate, Outlet, redirect } from '@tanstack/react-router';
import { House, LogOut } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { encerrarSessaoAdmin, ouvirSessaoAdmin, sessaoAdmin } from '@/lib/sessao';
import { ICONES_SECOES, SECOES } from '@/secoes';

/** Todas as páginas do painel pedem o login com 2FA (T-104a); sem sessão, vão para /entrar. */
export const Route = createFileRoute('/_painel')({
  beforeLoad: ({ location }) => {
    if (!sessaoAdmin()) {
      throw redirect({ to: '/entrar', search: { voltar: location.href } });
    }
  },
  component: Layout,
});

const CLASSES_LINK =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent';
const CLASSES_ATIVO = 'bg-sidebar-accent font-medium text-sidebar-accent-foreground';

/** Menu lateral com as seções do doc 13, quem está logado e a página da vez à direita. */
function Layout() {
  const { t } = useTranslation();
  const sessao = useSyncExternalStore(ouvirSessaoAdmin, sessaoAdmin);
  // A sessão acabou com a página aberta (saiu, 8 horas, renovação recusada).
  if (!sessao) return <Navigate to="/entrar" />;
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar p-4">
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
        <div className="mt-auto flex flex-col gap-2 border-t pt-4">
          <p className="truncate px-3 text-sm text-muted-foreground" title={sessao.admin.email}>
            {sessao.admin.nome}
          </p>
          <Button variant="ghost" className="justify-start" onClick={encerrarSessaoAdmin}>
            <LogOut aria-hidden />
            {t('sessao.sair')}
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
