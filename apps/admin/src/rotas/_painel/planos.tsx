import {
  alterarAdminPlanos,
  ErroApi,
  getPrecosAdminPlanosQueryKey,
  usePrecosAdminPlanos,
} from '@mony/api-client';
import {
  type PrecoAdmin,
  PRECO_MAXIMO_CENTAVOS,
  PRECO_MINIMO_CENTAVOS,
  type PrecosAdmin,
} from '@mony/shared/admin';
import { formatarCentavos, textoParaCentavos } from '@mony/shared/dinheiro';
import { PLANOS_PAGOS, type PlanoPago } from '@mony/shared/enums';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORMATO_DATA } from '@/lib/formatos';
import { Cupons } from '@/components/cupons';
import { PlanoGratuito } from '@/components/plano-gratuito';

export const Route = createFileRoute('/_painel/planos')({ component: Planos });

/**
 * Planos e preços (T-104b a T-104d, doc 13): o valor do mensal e do anual, os limites do gratuito,
 * a duração do teste, os cupons e o histórico de preços com data e autor.
 * O valor novo vale para quem assinar depois; quem já assina continua no preço antigo (RN-129).
 */
function Planos() {
  const { t } = useTranslation();
  const precos = usePrecosAdminPlanos();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.planos')}</h1>
      {precos.data ? (
        <>
          <div className="grid max-w-3xl gap-4 md:grid-cols-2">
            {PLANOS_PAGOS.map((plano) => (
              <PrecoDoPlano
                key={plano}
                plano={plano}
                vigente={precos.data.vigentes.find((preco) => preco.plano === plano)}
              />
            ))}
          </div>
          <PlanoGratuito />
          <Cupons />
          <Historico historico={precos.data.historico} />
        </>
      ) : precos.isError ? (
        <p role="alert" className="text-destructive">
          {t('planos.erroCarregar')}
        </p>
      ) : (
        <p className="text-muted-foreground">{t('planos.carregando')}</p>
      )}
    </div>
  );
}

function PrecoDoPlano({ plano, vigente }: { plano: PlanoPago; vigente: PrecoAdmin | undefined }) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [texto, definirTexto] = useState('');
  const [confirmar, definirConfirmar] = useState<number | null>(null);
  const [erro, definirErro] = useState<string | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const idCampo = `valor-${plano}`;

  const aoRevisar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    const valor = textoParaCentavos(texto);
    if (valor === null || valor < PRECO_MINIMO_CENTAVOS || valor > PRECO_MAXIMO_CENTAVOS) {
      definirErro(
        t('planos.valorInvalido', {
          minimo: formatarCentavos(PRECO_MINIMO_CENTAVOS),
          maximo: formatarCentavos(PRECO_MAXIMO_CENTAVOS),
        }),
      );
      return;
    }
    if (valor === vigente?.valorCentavos) {
      definirErro(t('planos.mesmoValor'));
      return;
    }
    definirErro(null);
    definirConfirmar(valor);
  };

  const aoConfirmar = async (valorCentavos: number) => {
    definirSalvando(true);
    try {
      const tabela: PrecosAdmin = await alterarAdminPlanos({ plano, valorCentavos });
      clienteConsultas.setQueryData(getPrecosAdminPlanosQueryKey(), tabela);
      definirTexto('');
      definirConfirmar(null);
    } catch (falha) {
      definirErro(
        falha instanceof ErroApi && falha.codigo === 'SERVICO_INDISPONIVEL'
          ? t('planos.stripeIndisponivel')
          : t('planos.erroSalvar'),
      );
    } finally {
      definirSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t(`planos.nomes.${plano}`)}</h2>
        </CardTitle>
        <CardDescription>
          {vigente
            ? t('planos.vigente', {
                valor: formatarCentavos(vigente.valorCentavos),
                desde: FORMATO_DATA.format(new Date(vigente.vigenteDesde)),
              })
            : t('planos.semPreco')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {confirmar === null ? (
          <form className="flex flex-col gap-3" onSubmit={aoRevisar}>
            <Label htmlFor={idCampo}>{t('planos.novoValor')}</Label>
            <div className="flex gap-2">
              <Input
                id={idCampo}
                inputMode="decimal"
                placeholder="0,00"
                value={texto}
                onChange={(evento) => {
                  definirTexto(evento.target.value);
                }}
              />
              <Button type="submit" variant="outline" disabled={texto.trim() === ''}>
                {t('planos.alterar')}
              </Button>
            </div>
            {erro ? <Aviso texto={erro} /> : null}
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {t('planos.confirmacao', {
                plano: t(`planos.nomes.${plano}`),
                novo: formatarCentavos(confirmar),
                atual: vigente ? formatarCentavos(vigente.valorCentavos) : '-',
              })}
            </p>
            {erro ? <Aviso texto={erro} /> : null}
            <div className="flex gap-2">
              <Button
                disabled={salvando}
                onClick={() => {
                  void aoConfirmar(confirmar);
                }}
              >
                {t('planos.confirmar')}
              </Button>
              <Button
                variant="ghost"
                disabled={salvando}
                onClick={() => {
                  definirErro(null);
                  definirConfirmar(null);
                }}
              >
                {t('planos.cancelar')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Historico({ historico }: { historico: PrecoAdmin[] }) {
  const { t } = useTranslation();
  return (
    <section className="flex max-w-3xl flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('planos.historico.titulo')}</h2>
      <table aria-label={t('planos.historico.titulo')} className="w-full text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">{t('planos.historico.plano')}</th>
            <th className="py-2 font-medium">{t('planos.historico.valor')}</th>
            <th className="py-2 font-medium">{t('planos.historico.desde')}</th>
            <th className="py-2 font-medium">{t('planos.historico.autor')}</th>
            <th className="py-2 font-medium">{t('planos.historico.situacao')}</th>
          </tr>
        </thead>
        <tbody>
          {historico.map((preco) => (
            <tr key={preco.id} className="border-b last:border-0">
              <td className="py-2">{t(`planos.nomes.${preco.plano}`)}</td>
              <td className="py-2 tabular-nums">{formatarCentavos(preco.valorCentavos)}</td>
              <td className="py-2">{FORMATO_DATA.format(new Date(preco.vigenteDesde))}</td>
              <td className="py-2">{preco.alteradoPor?.nome ?? t('planos.historico.script')}</td>
              <td className="py-2">
                {preco.vigente ? t('planos.historico.vigente') : t('planos.historico.antigo')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {texto}
    </p>
  );
}
