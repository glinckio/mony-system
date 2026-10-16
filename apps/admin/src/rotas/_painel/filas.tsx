import {
  ErroApi,
  reprocessarAdminFilas,
  reprocessarTodosAdminFilas,
  useFalhosAdminFilas,
  useListarAdminFilas,
} from '@mony/api-client';
import { type NomeFilaAdmin, TAMANHO_PAGINA_FALHOS } from '@mony/shared/admin';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/filas')({ component: Filas });

const NUMERO = new Intl.NumberFormat('pt-BR');

/**
 * Filas (T-141g, doc 13): quantos jobs há em cada estado, os que esgotaram as tentativas e
 * reprocessar um ou todos. No lugar do Bull Board, com o login e a auditoria do painel.
 */
function Filas() {
  const { t } = useTranslation();
  const consulta = useListarAdminFilas();
  const [escolhida, definirEscolhida] = useState<NomeFilaAdmin | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.filas')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('filas.titulo')}</h2>
          </CardTitle>
          <CardDescription>{t('filas.explicacao')}</CardDescription>
        </CardHeader>
        <CardContent>
          {consulta.data ? (
            <table aria-label={t('filas.titulo')} className="w-full text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t('filas.fila')}</th>
                  <th className="py-2 font-medium">{t('filas.aguardando')}</th>
                  <th className="py-2 font-medium">{t('filas.ativos')}</th>
                  <th className="py-2 font-medium">{t('filas.atrasados')}</th>
                  <th className="py-2 font-medium">{t('filas.falhos')}</th>
                  <th className="py-2 font-medium">{t('filas.concluidos')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {consulta.data.filas.map((fila) => (
                  <tr key={fila.nome} className="border-b">
                    <td className="py-2 pr-4">
                      <span>{t(`filas.nomes.${fila.nome}`)}</span>{' '}
                      <code className="text-xs text-muted-foreground">{fila.nome}</code>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{NUMERO.format(fila.aguardando)}</td>
                    <td className="py-2 pr-4 tabular-nums">{NUMERO.format(fila.ativos)}</td>
                    <td className="py-2 pr-4 tabular-nums">{NUMERO.format(fila.atrasados)}</td>
                    <td
                      className={`py-2 pr-4 tabular-nums ${fila.falhos > 0 ? 'font-semibold text-destructive' : ''}`}
                    >
                      {NUMERO.format(fila.falhos)}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{NUMERO.format(fila.concluidos)}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={fila.falhos === 0}
                        aria-label={t('filas.verFalhosDe', { fila: t(`filas.nomes.${fila.nome}`) })}
                        onClick={() => {
                          definirEscolhida(fila.nome);
                        }}
                      >
                        {t('filas.verFalhos')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
              {consulta.isError ? t('filas.erroCarregar') : t('filas.carregando')}
            </p>
          )}
        </CardContent>
      </Card>
      {escolhida ? <Falhos key={escolhida} fila={escolhida} /> : null}
    </div>
  );
}

function Falhos({ fila }: { fila: NomeFilaAdmin }) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [pagina, definirPagina] = useState(1);
  const [aviso, definirAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [trabalhando, definirTrabalhando] = useState(false);
  const consulta = useFalhosAdminFilas(fila, { pagina });
  const nome = t(`filas.nomes.${fila}`);

  const executar = async (acao: () => Promise<{ reprocessados: number }>) => {
    definirTrabalhando(true);
    definirAviso(null);
    try {
      const { reprocessados } = await acao();
      definirAviso({ tipo: 'ok', texto: t('filas.reprocessados', { count: reprocessados }) });
      await clienteConsultas.invalidateQueries({ queryKey: ['/v1/admin/filas'] });
      await clienteConsultas.invalidateQueries({ queryKey: [`/v1/admin/filas/${fila}/falhos`] });
    } catch (falha) {
      definirAviso({
        tipo: 'erro',
        texto: falha instanceof ErroApi ? falha.message : t('filas.erroReprocessar'),
      });
    } finally {
      definirTrabalhando(false);
    }
  };

  const total = consulta.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_FALHOS));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('filas.falhosDe', { fila: nome })}</h2>
        </CardTitle>
        <CardDescription>{t('filas.explicacaoFalhos')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="outline"
            disabled={trabalhando || total === 0}
            onClick={() => {
              if (window.confirm(t('filas.confirmarTodos', { count: total, fila: nome }))) {
                void executar(() => reprocessarTodosAdminFilas(fila));
              }
            }}
          >
            {t('filas.reprocessarTodos')}
          </Button>
          {aviso ? (
            <p
              role={aviso.tipo === 'erro' ? 'alert' : 'status'}
              className={
                aviso.tipo === 'erro' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
              }
            >
              {aviso.texto}
            </p>
          ) : null}
        </div>
        {consulta.data ? (
          consulta.data.jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('filas.semFalhos')}</p>
          ) : (
            <table
              aria-label={t('filas.falhosDe', { fila: nome })}
              className="w-full text-left text-sm"
            >
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t('filas.job')}</th>
                  <th className="py-2 font-medium">{t('filas.motivo')}</th>
                  <th className="py-2 font-medium">{t('filas.tentativas')}</th>
                  <th className="py-2 font-medium">{t('filas.falhouEm')}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {consulta.data.jobs.map((job) => (
                  <tr key={job.id} className="border-b align-top">
                    <td className="py-2 pr-4">
                      <span>{job.nome}</span>
                      <code className="block text-xs text-muted-foreground">{job.id}</code>
                    </td>
                    <td className="py-2 pr-4 break-all">{job.motivo || '-'}</td>
                    <td className="py-2 pr-4 tabular-nums">{job.tentativas}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {job.falhouEm ? FORMATO_DATA.format(new Date(job.falhouEm)) : '-'}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={trabalhando}
                        aria-label={t('filas.reprocessarJob', { id: job.id })}
                        onClick={() => void executar(() => reprocessarAdminFilas(fila, job.id))}
                      >
                        {t('filas.reprocessar')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
            {consulta.isError ? t('filas.erroCarregar') : t('filas.carregando')}
          </p>
        )}
        {paginas > 1 ? (
          <div className="flex items-center gap-4 text-sm">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => {
                definirPagina(pagina - 1);
              }}
            >
              {t('filas.anterior')}
            </Button>
            <span>{t('filas.pagina', { pagina, paginas })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= paginas}
              onClick={() => {
                definirPagina(pagina + 1);
              }}
            >
              {t('filas.proxima')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
