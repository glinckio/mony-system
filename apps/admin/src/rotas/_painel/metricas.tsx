import { ErroApi, atualizarAdminMetricas, useLerAdminMetricas } from '@mony/api-client';
import type { MetricasAdmin } from '@mony/shared/admin';
import { dataNoFuso } from '@mony/shared/datas';
import { ORIGENS_TRANSACAO } from '@mony/shared/enums';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/metricas')({ component: Metricas });

const NUMERO = new Intl.NumberFormat('pt-BR');
const PORCENTO = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const FORMATO_DIA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});
const dia = (data: string) => FORMATO_DIA.format(new Date(`${data}T12:00:00Z`));
const fracao = (parte: number, todo: number) => PORCENTO.format(todo === 0 ? 0 : parte / todo);

/** Os últimos 30 dias até hoje, em São Paulo. */
function periodoPadrao(): { de: string; ate: string } {
  const hoje = dataNoFuso(new Date());
  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 29);
  return { de: inicio.toISOString().slice(0, 10), ate: hoje };
}

/**
 * Métricas (T-141f, doc 13): usuários ativos, lançamentos por origem e alertas no período, pelas
 * materialized views que a rotina atualiza de hora em hora (ou o botão, na hora).
 */
function Metricas() {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [rascunho, definirRascunho] = useState(periodoPadrao);
  const [periodo, definirPeriodo] = useState(rascunho);
  const [erro, definirErro] = useState<string | null>(null);
  const [atualizando, definirAtualizando] = useState(false);
  const consulta = useLerAdminMetricas(periodo);

  const aoFiltrar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (!rascunho.de || !rascunho.ate || rascunho.de > rascunho.ate) {
      definirErro(t('metricas.periodoInvalido'));
      return;
    }
    definirPeriodo(rascunho);
  };

  const aoAtualizar = async () => {
    definirAtualizando(true);
    definirErro(null);
    try {
      await atualizarAdminMetricas();
      await clienteConsultas.invalidateQueries({ queryKey: ['/v1/admin/metricas'] });
    } catch (falha) {
      definirErro(falha instanceof ErroApi ? falha.message : t('metricas.erroAtualizar'));
    } finally {
      definirAtualizando(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.metricas')}</h1>
      <form className="flex flex-wrap items-end gap-4" onSubmit={aoFiltrar}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="metricas-de">{t('metricas.de')}</Label>
          <Input
            id="metricas-de"
            type="date"
            className="w-40"
            value={rascunho.de}
            onChange={(evento) => {
              definirErro(null);
              definirRascunho({ ...rascunho, de: evento.target.value });
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="metricas-ate">{t('metricas.ate')}</Label>
          <Input
            id="metricas-ate"
            type="date"
            className="w-40"
            value={rascunho.ate}
            onChange={(evento) => {
              definirErro(null);
              definirRascunho({ ...rascunho, ate: evento.target.value });
            }}
          />
        </div>
        <Button type="submit">{t('metricas.ver')}</Button>
        <Button
          type="button"
          variant="outline"
          disabled={atualizando}
          onClick={() => void aoAtualizar()}
        >
          {t('metricas.atualizarAgora')}
        </Button>
      </form>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      {consulta.data ? (
        <Painel metricas={consulta.data} />
      ) : (
        <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
          {consulta.isError ? t('metricas.erroCarregar') : t('metricas.carregando')}
        </p>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{rotulo}</CardDescription>
        <CardTitle>
          <p className="text-3xl font-semibold">{valor}</p>
        </CardTitle>
      </CardHeader>
      {detalhe ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">{detalhe}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function Painel({ metricas }: { metricas: MetricasAdmin }) {
  const { t } = useTranslation();
  const { ativos, lancamentos, alertas } = metricas;
  const maiorDia = Math.max(1, ...ativos.porDia.map(({ ativos: quantos }) => quantos));
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {metricas.atualizadasEm
          ? t('metricas.atualizadasEm', {
              quando: FORMATO_DATA.format(new Date(metricas.atualizadasEm)),
            })
          : t('metricas.nuncaAtualizadas')}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Numero
          rotulo={t('metricas.ativosNoPeriodo')}
          valor={NUMERO.format(ativos.noPeriodo)}
          detalhe={t('metricas.explicacaoAtivos')}
        />
        <Numero rotulo={t('metricas.lancamentos')} valor={NUMERO.format(lancamentos.total)} />
        <Numero
          rotulo={t('metricas.alertasEnviados')}
          valor={NUMERO.format(alertas.enviados)}
          detalhe={t('metricas.alertasDetalhe', {
            criados: NUMERO.format(alertas.criados),
            lidos: NUMERO.format(alertas.lidos),
          })}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('metricas.lancamentosPorOrigem')}</h2>
          </CardTitle>
          <CardDescription>{t('metricas.explicacaoLancamentos')}</CardDescription>
        </CardHeader>
        <CardContent>
          <table
            aria-label={t('metricas.lancamentosPorOrigem')}
            className="w-full text-left text-sm"
          >
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t('metricas.origem')}</th>
                <th className="py-2 font-medium">{t('metricas.quantidade')}</th>
                <th className="py-2 font-medium">{t('metricas.parte')}</th>
              </tr>
            </thead>
            <tbody>
              {ORIGENS_TRANSACAO.map((origem) => (
                <tr key={origem} className="border-b">
                  <td className="py-2 pr-4">{t(`metricas.origens.${origem}`)}</td>
                  <td className="py-2 pr-4">{NUMERO.format(lancamentos.porOrigem[origem])}</td>
                  <td className="py-2">
                    {fracao(lancamentos.porOrigem[origem], lancamentos.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('metricas.alertasPorTipo')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertas.porTipo.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('metricas.semAlertas')}</p>
          ) : (
            <table aria-label={t('metricas.alertasPorTipo')} className="w-full text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t('metricas.tipo')}</th>
                  <th className="py-2 font-medium">{t('metricas.criados')}</th>
                  <th className="py-2 font-medium">{t('metricas.enviados')}</th>
                  <th className="py-2 font-medium">{t('metricas.lidos')}</th>
                </tr>
              </thead>
              <tbody>
                {alertas.porTipo.map((linha) => (
                  <tr key={linha.tipo} className="border-b">
                    <td className="py-2 pr-4">{t(`metricas.tipos.${linha.tipo}`)}</td>
                    <td className="py-2 pr-4">{NUMERO.format(linha.criados)}</td>
                    <td className="py-2 pr-4">{NUMERO.format(linha.enviados)}</td>
                    <td className="py-2">
                      {NUMERO.format(linha.lidos)} ({fracao(linha.lidos, linha.enviados)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('metricas.porDia')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ativos.porDia.length === 0 && lancamentos.porDia.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('metricas.semDados')}</p>
          ) : (
            <table aria-label={t('metricas.porDia')} className="w-full text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t('metricas.dia')}</th>
                  <th className="py-2 font-medium">{t('metricas.ativos')}</th>
                  <th className="py-2 font-medium">{t('metricas.lancamentos')}</th>
                </tr>
              </thead>
              <tbody>
                {dias(metricas).map(({ data, ativosNoDia, lancamentosNoDia }) => (
                  <tr key={data} className="border-b">
                    <td className="py-2 pr-4 whitespace-nowrap">{dia(data)}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="w-12 tabular-nums">{NUMERO.format(ativosNoDia)}</span>
                        <span
                          aria-hidden
                          className="h-2 rounded-sm bg-primary"
                          style={{ width: `${String((ativosNoDia / maiorDia) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2 tabular-nums">{NUMERO.format(lancamentosNoDia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Os dias com ativos ou lançamentos, do mais novo ao mais antigo. */
function dias(metricas: MetricasAdmin) {
  const linhas = new Map<string, { ativosNoDia: number; lancamentosNoDia: number }>();
  for (const { dia: data, ativos } of metricas.ativos.porDia) {
    linhas.set(data, { ativosNoDia: ativos, lancamentosNoDia: 0 });
  }
  for (const { dia: data, porOrigem } of metricas.lancamentos.porDia) {
    const total = Object.values(porOrigem).reduce((soma, valor) => soma + valor, 0);
    linhas.set(data, { ativosNoDia: linhas.get(data)?.ativosNoDia ?? 0, lancamentosNoDia: total });
  }
  return [...linhas]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, valores]) => ({ data, ...valores }));
}
