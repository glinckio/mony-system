import { listarAdminAssinaturas, useResumoAdminAssinaturas } from '@mony/api-client';
import {
  type AssinaturaResumoAdmin,
  type AssinaturasAdmin,
  type ResumoAssinaturasAdmin,
  SITUACOES_ASSINATURA_ADMIN,
  type SituacaoAssinaturaAdmin,
} from '@mony/shared/admin';
import { formatarCentavos } from '@mony/shared/dinheiro';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/assinaturas')({ component: Assinaturas });

const FORMATO_PERCENTUAL = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
});

/**
 * Assinaturas (T-141b, doc 13): contas por situação, MRR e conversão do teste, e a lista das contas
 * da situação escolhida. Só leitura; para mudar uma conta, a página do usuário.
 */
function Assinaturas() {
  const { t } = useTranslation();
  const resumo = useResumoAdminAssinaturas();
  const [situacao, definirSituacao] = useState<SituacaoAssinaturaAdmin>('ativa');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.assinaturas')}</h1>
      {resumo.data ? (
        <Resumo resumo={resumo.data} situacao={situacao} aoEscolher={definirSituacao} />
      ) : resumo.isError ? (
        <p role="alert" className="text-destructive">
          {t('assinaturas.erroCarregar')}
        </p>
      ) : (
        <p className="text-muted-foreground">{t('assinaturas.carregando')}</p>
      )}
      <Lista situacao={situacao} />
    </div>
  );
}

function Resumo({
  resumo,
  situacao,
  aoEscolher,
}: {
  resumo: ResumoAssinaturasAdmin;
  situacao: SituacaoAssinaturaAdmin;
  aoEscolher: (situacao: SituacaoAssinaturaAdmin) => void;
}) {
  const { t } = useTranslation();
  const { dias, encerrados, convertidos } = resumo.conversaoTeste;
  return (
    <>
      <section aria-label={t('assinaturas.situacoesTitulo')} className="flex flex-wrap gap-3">
        {SITUACOES_ASSINATURA_ADMIN.map((item) => (
          <Button
            key={item}
            variant={item === situacao ? 'default' : 'outline'}
            aria-pressed={item === situacao}
            aria-label={`${t(`assinaturas.situacoes.${item}`)}: ${String(resumo.situacoes[item])}`}
            className="h-auto flex-col items-start gap-0.5 px-4 py-3"
            onClick={() => {
              aoEscolher(item);
            }}
          >
            <span className="text-2xl font-semibold">{resumo.situacoes[item]}</span>
            <span className="text-xs">{t(`assinaturas.situacoes.${item}`)}</span>
          </Button>
        ))}
      </section>
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('assinaturas.mrr')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="text-3xl font-semibold">{formatarCentavos(resumo.mrrCentavos)}</p>
            <p className="text-muted-foreground">{t('assinaturas.mrrAjuda')}</p>
            <p>{t('assinaturas.pagasPorPlano', resumo.pagasPorPlano)}</p>
            {resumo.cancelamentoAgendado > 0 ? (
              <p>
                {t('assinaturas.cancelamentoAgendado', {
                  quantidade: resumo.cancelamentoAgendado,
                })}
              </p>
            ) : null}
            {resumo.mrrInadimplenteCentavos > 0 ? (
              <p className="text-destructive">
                {t('assinaturas.mrrInadimplente', {
                  valor: formatarCentavos(resumo.mrrInadimplenteCentavos),
                })}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('assinaturas.conversao')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {encerrados === 0 ? (
              <p className="text-muted-foreground">{t('assinaturas.semConversao', { dias })}</p>
            ) : (
              <>
                <p className="text-3xl font-semibold">
                  {FORMATO_PERCENTUAL.format(convertidos / encerrados)}
                </p>
                <p>{t('assinaturas.conversaoDetalhe', { convertidos, encerrados })}</p>
              </>
            )}
            <p className="text-muted-foreground">{t('assinaturas.conversaoAjuda', { dias })}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Lista({ situacao }: { situacao: SituacaoAssinaturaAdmin }) {
  const { t } = useTranslation();
  const consulta = useInfiniteQuery({
    queryKey: ['/v1/admin/assinaturas', situacao],
    queryFn: ({ pageParam }) =>
      listarAdminAssinaturas({
        situacao,
        ...(pageParam ? { cursor: pageParam } : {}),
        limite: 20,
      }),
    initialPageParam: '',
    getNextPageParam: (pagina: AssinaturasAdmin) => pagina.proximoCursor ?? undefined,
  });
  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? [];
  const titulo = t('assinaturas.lista', { situacao: t(`assinaturas.situacoes.${situacao}`) });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {consulta.isError ? (
        <p role="alert" className="text-destructive">
          {t('assinaturas.erroCarregar')}
        </p>
      ) : consulta.isPending ? (
        <p className="text-muted-foreground">{t('assinaturas.carregando')}</p>
      ) : itens.length === 0 ? (
        <p className="text-muted-foreground">{t('assinaturas.nenhuma')}</p>
      ) : (
        <>
          <table aria-label={titulo} className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t('assinaturas.nome')}</th>
                <th className="py-2 font-medium">{t('assinaturas.email')}</th>
                <th className="py-2 font-medium">{t('assinaturas.plano')}</th>
                <th className="py-2 font-medium">{t('assinaturas.valor')}</th>
                <th className="py-2 font-medium">{t(colunaDeData(situacao))}</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <Linha key={item.usuarioId} item={item} />
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
              {t('assinaturas.carregarMais')}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** A data que importa em cada situação: fim do teste, próxima cobrança ou cancelamento. */
function colunaDeData(situacao: SituacaoAssinaturaAdmin) {
  if (situacao === 'teste' || situacao === 'gratuito') return 'assinaturas.testeAte' as const;
  if (situacao === 'cancelada') return 'assinaturas.canceladaEm' as const;
  return 'assinaturas.proximaCobranca' as const;
}

function Linha({ item }: { item: AssinaturaResumoAdmin }) {
  const { t } = useTranslation();
  const nenhum = t('assinaturas.nenhumDado');
  const data =
    item.situacao === 'teste' || item.situacao === 'gratuito'
      ? item.testeFim
      : item.situacao === 'cancelada'
        ? item.canceladaEm
        : item.proximaCobranca;
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4">
        <Link
          to="/usuarios/$id"
          params={{ id: item.usuarioId }}
          className="font-medium underline-offset-4 hover:underline"
        >
          {item.nome}
        </Link>
      </td>
      <td className="py-2 pr-4">{item.email}</td>
      <td className="py-2 pr-4">
        {item.plano ? t(`usuarios.planos.${item.plano}`) : t('assinaturas.semAssinatura')}
      </td>
      <td className="py-2 pr-4">
        {item.valorCentavos === null ? nenhum : formatarCentavos(item.valorCentavos)}
      </td>
      <td className="py-2">
        {data ? FORMATO_DATA.format(new Date(data)) : nenhum}
        {item.situacao === 'ativa' && item.cancelamentoAgendado
          ? ` · ${t('assinaturas.cancelamentoAgendadoCurto')}`
          : ''}
      </td>
    </tr>
  );
}
