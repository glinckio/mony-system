import { registrosAdminAuditoria, useFiltrosAdminAuditoria } from '@mony/api-client';
import type { AuditoriaAdmin, RegistroAuditoriaAdmin } from '@mony/shared/admin';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/auditoria')({ component: Auditoria });

interface Filtros {
  adminId: string;
  acao: string;
  entidade: string;
  entidadeId: string;
  de: string;
  ate: string;
}

const SEM_FILTRO: Filtros = {
  adminId: '',
  acao: '',
  entidade: '',
  entidadeId: '',
  de: '',
  ate: '',
};

const CLASSE_SELECT =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Só os filtros preenchidos vão para a consulta. */
function preenchidos(filtros: Filtros): Partial<Filtros> {
  const resultado: Partial<Filtros> = {};
  for (const chave of Object.keys(filtros) as (keyof Filtros)[]) {
    const valor = filtros[chave].trim();
    if (valor !== '') resultado[chave] = valor;
  }
  return resultado;
}

/**
 * Auditoria (T-141c, doc 13): as ações e visualizações dos admins, da mais nova à mais antiga, 50
 * por vez, com filtros por admin, ação, entidade e período (dias de São Paulo).
 */
function Auditoria() {
  const { t } = useTranslation();
  const opcoes = useFiltrosAdminAuditoria();
  const [rascunho, definirRascunho] = useState<Filtros>(SEM_FILTRO);
  const [filtros, definirFiltros] = useState<Partial<Filtros>>({});
  const [erro, definirErro] = useState<string | null>(null);
  const consulta = useInfiniteQuery({
    queryKey: ['/v1/admin/auditoria', filtros],
    queryFn: ({ pageParam }) =>
      registrosAdminAuditoria({
        ...filtros,
        ...(pageParam ? { cursor: pageParam } : {}),
        limite: 50,
      }),
    initialPageParam: '',
    getNextPageParam: (pagina: AuditoriaAdmin) => pagina.proximoCursor ?? undefined,
  });
  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? [];

  const campo = (chave: keyof Filtros) => ({
    id: `filtro-${chave}`,
    value: rascunho[chave],
    onChange: (evento: { target: { value: string } }) => {
      definirErro(null);
      definirRascunho({ ...rascunho, [chave]: evento.target.value });
    },
  });

  const aoFiltrar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (rascunho.de && rascunho.ate && rascunho.de > rascunho.ate) {
      definirErro(t('auditoria.periodoInvalido'));
      return;
    }
    definirFiltros(preenchidos(rascunho));
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.auditoria')}</h1>
      <form
        aria-label={t('auditoria.filtros')}
        className="flex flex-wrap items-end gap-3"
        onSubmit={aoFiltrar}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-adminId">{t('auditoria.admin')}</Label>
          <select className={CLASSE_SELECT} {...campo('adminId')}>
            <option value="">{t('auditoria.todos')}</option>
            {opcoes.data?.admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-acao">{t('auditoria.acao')}</Label>
          <select className={CLASSE_SELECT} {...campo('acao')}>
            <option value="">{t('auditoria.todas')}</option>
            {opcoes.data?.acoes.map((acao) => (
              <option key={acao} value={acao}>
                {acao}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-entidade">{t('auditoria.entidade')}</Label>
          <select className={CLASSE_SELECT} {...campo('entidade')}>
            <option value="">{t('auditoria.todas')}</option>
            {opcoes.data?.entidades.map((entidade) => (
              <option key={entidade} value={entidade}>
                {entidade}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-entidadeId">{t('auditoria.entidadeId')}</Label>
          <Input className="w-72" {...campo('entidadeId')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-de">{t('auditoria.de')}</Label>
          <Input type="date" className="w-40" {...campo('de')} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="filtro-ate">{t('auditoria.ate')}</Label>
          <Input type="date" className="w-40" {...campo('ate')} />
        </div>
        <Button type="submit">{t('auditoria.filtrar')}</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            definirErro(null);
            definirRascunho(SEM_FILTRO);
            definirFiltros({});
          }}
        >
          {t('auditoria.limpar')}
        </Button>
      </form>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      {consulta.isError ? (
        <p role="alert" className="text-destructive">
          {t('auditoria.erroCarregar')}
        </p>
      ) : consulta.isPending ? (
        <p className="text-muted-foreground">{t('auditoria.carregando')}</p>
      ) : itens.length === 0 ? (
        <p className="text-muted-foreground">{t('auditoria.nenhum')}</p>
      ) : (
        <>
          <table aria-label={t('secoes.auditoria')} className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t('auditoria.quando')}</th>
                <th className="py-2 font-medium">{t('auditoria.admin')}</th>
                <th className="py-2 font-medium">{t('auditoria.acao')}</th>
                <th className="py-2 font-medium">{t('auditoria.alvo')}</th>
                <th className="py-2 font-medium">{t('auditoria.detalhes')}</th>
                <th className="py-2 font-medium">{t('auditoria.ip')}</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((registro) => (
                <Linha key={registro.id} registro={registro} />
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
              {t('auditoria.carregarMais')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

/** `antes` e `depois` em uma linha: "status: ativo → bloqueado". */
function detalhes(registro: RegistroAuditoriaAdmin): string {
  const antes = registro.antes ?? {};
  const depois = registro.depois ?? {};
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];
  const texto = (valor: unknown) =>
    valor === undefined ? '—' : typeof valor === 'string' ? valor : JSON.stringify(valor);
  return chaves
    .map((chave) =>
      chave in antes && chave in depois
        ? `${chave}: ${texto(antes[chave])} → ${texto(depois[chave])}`
        : `${chave}: ${texto(chave in depois ? depois[chave] : antes[chave])}`,
    )
    .join(' · ');
}

function Linha({ registro }: { registro: RegistroAuditoriaAdmin }) {
  const { t } = useTranslation();
  const nenhum = t('auditoria.nenhumDado');
  return (
    <tr className="border-b align-top last:border-0">
      <td className="whitespace-nowrap py-2 pr-4">
        {FORMATO_DATA.format(new Date(registro.criadoEm))}
      </td>
      <td className="py-2 pr-4">{registro.admin?.nome ?? t('auditoria.contaApagada')}</td>
      <td className="py-2 pr-4 font-mono text-xs">{registro.acao}</td>
      <td className="py-2 pr-4">
        {registro.entidade === 'usuario' && registro.entidadeId ? (
          <Link
            to="/usuarios/$id"
            params={{ id: registro.entidadeId }}
            className="underline-offset-4 hover:underline"
          >
            {t('auditoria.verUsuario')}
          </Link>
        ) : (
          <span>
            {registro.entidade}
            {registro.entidadeId ? ` ${registro.entidadeId.slice(0, 8)}` : ''}
          </span>
        )}
      </td>
      <td className="max-w-md break-words py-2 pr-4 text-xs">{detalhes(registro) || nenhum}</td>
      <td className="py-2 font-mono text-xs">{registro.ip ?? nenhum}</td>
    </tr>
  );
}
