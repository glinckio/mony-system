import { buscarAdminUsuarios } from '@mony/api-client';
import type { UsuariosAdmin } from '@mony/shared/admin';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/usuarios/')({ component: Usuarios });

/**
 * Usuários (T-141a, doc 13): busca por nome, e-mail ou telefone, das contas mais novas às mais
 * antigas, 20 por vez. A busca com texto vai para a auditoria.
 */
function Usuarios() {
  const { t } = useTranslation();
  const [texto, definirTexto] = useState('');
  const [busca, definirBusca] = useState('');
  const consulta = useInfiniteQuery({
    queryKey: ['/v1/admin/usuarios', 'busca', busca],
    queryFn: ({ pageParam }) =>
      buscarAdminUsuarios({
        ...(busca ? { busca } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
        limite: 20,
      }),
    initialPageParam: '',
    getNextPageParam: (pagina: UsuariosAdmin) => pagina.proximoCursor ?? undefined,
  });
  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? [];

  const aoBuscar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    definirBusca(texto.trim());
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.usuarios')}</h1>
      <form role="search" className="flex max-w-xl gap-2" onSubmit={aoBuscar}>
        <Input
          aria-label={t('usuarios.buscar')}
          placeholder={t('usuarios.buscarAjuda')}
          value={texto}
          onChange={(evento) => {
            definirTexto(evento.target.value);
          }}
        />
        <Button type="submit">{t('usuarios.buscar')}</Button>
      </form>
      {consulta.isError ? (
        <p role="alert" className="text-destructive">
          {t('usuarios.erroCarregar')}
        </p>
      ) : consulta.isPending ? (
        <p className="text-muted-foreground">{t('usuarios.carregando')}</p>
      ) : itens.length === 0 ? (
        <p className="text-muted-foreground">{t('usuarios.nenhum')}</p>
      ) : (
        <>
          <table aria-label={t('secoes.usuarios')} className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t('usuarios.nome')}</th>
                <th className="py-2 font-medium">{t('usuarios.email')}</th>
                <th className="py-2 font-medium">{t('usuarios.plano')}</th>
                <th className="py-2 font-medium">{t('usuarios.status')}</th>
                <th className="py-2 font-medium">{t('usuarios.criadoEm')}</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((usuario) => (
                <tr key={usuario.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <Link
                      to="/usuarios/$id"
                      params={{ id: usuario.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {usuario.nome}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{usuario.email}</td>
                  <td className="py-2 pr-4">{t(`usuarios.planos.${usuario.plano}`)}</td>
                  <td className="py-2 pr-4">{t(`usuarios.situacoes.${usuario.status}`)}</td>
                  <td className="py-2">{FORMATO_DATA.format(new Date(usuario.criadoEm))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {consulta.hasNextPage ? (
            <Button
              variant="outline"
              className="self-start"
              disabled={consulta.isFetchingNextPage}
              onClick={() => void consulta.fetchNextPage()}
            >
              {t('usuarios.carregarMais')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
