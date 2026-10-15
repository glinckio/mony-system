import {
  getPlanoGratuitoAdminPlanosQueryKey,
  salvarPlanoGratuitoAdminPlanos,
  usePlanoGratuitoAdminPlanos,
} from '@mony/api-client';
import {
  DURACAO_TESTE_MAXIMA_DIAS,
  DURACAO_TESTE_MINIMA_DIAS,
  LIMITE_MAXIMO,
  type PlanoGratuitoAdmin,
} from '@mony/shared/admin';
import { useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** O formulário guarda texto; vazio é "sem limite". */
type Campos = Record<string, string>;

const texto = (valor: number | null) => (valor === null ? '' : String(valor));

function camposDe(plano: PlanoGratuitoAdmin): Campos {
  const campos: Campos = { duracaoTesteDias: String(plano.duracaoTesteDias) };
  for (const item of plano.limitesDeUso) {
    campos[`${item.recurso}.limiteDia`] = texto(item.limiteDia);
    campos[`${item.recurso}.limiteMes`] = texto(item.limiteMes);
  }
  for (const item of plano.limitesDeQuantidade) {
    campos[`${item.recurso}.limiteQuantidade`] = texto(item.limiteQuantidade);
  }
  return campos;
}

/** `undefined`: número inválido. */
function limiteDe(valor: string | undefined): number | null | undefined {
  const limpo = (valor ?? '').trim();
  if (limpo === '') return null;
  if (!/^\d+$/.test(limpo)) return undefined;
  const numero = Number(limpo);
  return numero <= LIMITE_MAXIMO ? numero : undefined;
}

function planoDe(campos: Campos, base: PlanoGratuitoAdmin): PlanoGratuitoAdmin | null {
  const dias = Number(campos.duracaoTesteDias);
  if (
    !Number.isInteger(dias) ||
    dias < DURACAO_TESTE_MINIMA_DIAS ||
    dias > DURACAO_TESTE_MAXIMA_DIAS
  ) {
    return null;
  }
  const limitesDeUso = base.limitesDeUso.map((item) => ({
    recurso: item.recurso,
    limiteDia: limiteDe(campos[`${item.recurso}.limiteDia`]),
    limiteMes: limiteDe(campos[`${item.recurso}.limiteMes`]),
  }));
  const limitesDeQuantidade = base.limitesDeQuantidade.map((item) => ({
    recurso: item.recurso,
    limiteQuantidade: limiteDe(campos[`${item.recurso}.limiteQuantidade`]),
  }));
  const valido =
    limitesDeUso.every((item) => item.limiteDia !== undefined && item.limiteMes !== undefined) &&
    limitesDeQuantidade.every((item) => item.limiteQuantidade !== undefined);
  return valido
    ? ({ duracaoTesteDias: dias, limitesDeUso, limitesDeQuantidade } as PlanoGratuitoAdmin)
    : null;
}

/**
 * Limites do plano gratuito (RN-120) e duração do teste grátis (RN-006), T-104c. Os limites valem
 * na hora; a duração, para quem se cadastrar depois. Campo vazio: sem limite.
 */
export function PlanoGratuito() {
  const { t } = useTranslation();
  const consulta = usePlanoGratuitoAdminPlanos();
  if (consulta.data) return <Formulario plano={consulta.data} />;
  return (
    <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
      {consulta.isError ? t('gratuito.erroCarregar') : t('planos.carregando')}
    </p>
  );
}

function Formulario({ plano }: { plano: PlanoGratuitoAdmin }) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [campos, definirCampos] = useState<Campos>(() => camposDe(plano));
  const [aviso, definirAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, definirSalvando] = useState(false);

  const campo = (chave: string, rotulo: string) => (
    <Input
      aria-label={rotulo}
      inputMode="numeric"
      placeholder={t('gratuito.semLimite')}
      value={campos[chave] ?? ''}
      onChange={(evento) => {
        definirAviso(null);
        definirCampos((atuais) => ({ ...atuais, [chave]: evento.target.value }));
      }}
    />
  );

  const aoSalvar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const novo = planoDe(campos, plano);
    if (!novo) {
      definirAviso({
        tipo: 'erro',
        texto: t('gratuito.invalido', {
          minimo: DURACAO_TESTE_MINIMA_DIAS,
          maximo: DURACAO_TESTE_MAXIMA_DIAS,
          limite: LIMITE_MAXIMO.toLocaleString('pt-BR'),
        }),
      });
      return;
    }
    definirSalvando(true);
    try {
      const salvo = await salvarPlanoGratuitoAdminPlanos(novo);
      clienteConsultas.setQueryData(getPlanoGratuitoAdminPlanosQueryKey(), salvo);
      definirCampos(camposDe(salvo));
      definirAviso({ tipo: 'ok', texto: t('gratuito.salvo') });
    } catch {
      definirAviso({ tipo: 'erro', texto: t('gratuito.erroSalvar') });
    } finally {
      definirSalvando(false);
    }
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <h2>{t('gratuito.titulo')}</h2>
        </CardTitle>
        <CardDescription>{t('gratuito.descricao')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6" onSubmit={(evento) => void aoSalvar(evento)}>
          <div className="flex max-w-xs flex-col gap-2">
            <Label htmlFor="duracao-teste">{t('gratuito.duracaoTeste')}</Label>
            <Input
              id="duracao-teste"
              inputMode="numeric"
              value={campos.duracaoTesteDias ?? ''}
              onChange={(evento) => {
                definirAviso(null);
                definirCampos((atuais) => ({ ...atuais, duracaoTesteDias: evento.target.value }));
              }}
            />
            <p className="text-xs text-muted-foreground">{t('gratuito.duracaoAjuda')}</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t('gratuito.recurso')}</th>
                <th className="py-2 font-medium">{t('gratuito.porDia')}</th>
                <th className="py-2 font-medium">{t('gratuito.porMes')}</th>
              </tr>
            </thead>
            <tbody>
              {plano.limitesDeUso.map((item) => {
                const nome = t(`gratuito.recursos.${item.recurso}`);
                return (
                  <tr key={item.recurso} className="border-b">
                    <td className="py-2 pr-4">{nome}</td>
                    <td className="py-2 pr-4">
                      {campo(`${item.recurso}.limiteDia`, `${nome}: ${t('gratuito.porDia')}`)}
                    </td>
                    <td className="py-2">
                      {campo(`${item.recurso}.limiteMes`, `${nome}: ${t('gratuito.porMes')}`)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t('gratuito.recurso')}</th>
                <th className="py-2 font-medium">{t('gratuito.quantidade')}</th>
              </tr>
            </thead>
            <tbody>
              {plano.limitesDeQuantidade.map((item) => {
                const nome = t(`gratuito.recursos.${item.recurso}`);
                return (
                  <tr key={item.recurso} className="border-b last:border-0">
                    <td className="py-2 pr-4">{nome}</td>
                    <td className="py-2">
                      {campo(
                        `${item.recurso}.limiteQuantidade`,
                        `${nome}: ${t('gratuito.quantidade')}`,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-4">
            <Button type="submit" disabled={salvando}>
              {t('gratuito.salvar')}
            </Button>
            {aviso ? (
              <p
                role={aviso.tipo === 'erro' ? 'alert' : 'status'}
                className={
                  aviso.tipo === 'erro'
                    ? 'text-sm text-destructive'
                    : 'text-sm text-muted-foreground'
                }
              >
                {aviso.texto}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
