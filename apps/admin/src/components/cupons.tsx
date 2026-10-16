import {
  criarAdminCupons,
  desativarAdminCupons,
  ErroApi,
  getListarAdminCuponsQueryKey,
  useListarAdminCupons,
} from '@mony/api-client';
import {
  type CupomAdmin,
  PADRAO_CODIGO_CUPOM,
  PERCENTUAL_CUPOM_MAXIMO,
  PERCENTUAL_CUPOM_MINIMO,
} from '@mony/shared/admin';
import { useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FORMATO_DIA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' });

const dia = (data: string) => FORMATO_DIA.format(new Date(`${data}T12:00:00Z`));

/**
 * Cupons do painel (T-104d, RN-130): o código vale em "Adicionar código promocional" na página de
 * pagamento da Stripe e dá o desconto na primeira cobrança. Desativar tira o código; quem já usou
 * fica com o desconto.
 */
export function Cupons() {
  const { t } = useTranslation();
  const consulta = useListarAdminCupons();
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <h2>{t('cupons.titulo')}</h2>
        </CardTitle>
        <CardDescription>{t('cupons.descricao')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <NovoCupom />
        {consulta.data ? (
          <Lista cupons={consulta.data} />
        ) : (
          <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
            {consulta.isError ? t('cupons.erroCarregar') : t('cupons.carregando')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Conflito e validade passada trazem a frase da API; o resto, o texto do painel. */
function mensagemDoErro(falha: unknown, textos: { stripe: string; padrao: string }): string {
  if (falha instanceof ErroApi) {
    if (falha.codigo === 'CONFLITO' || falha.codigo === 'REQUISICAO_INVALIDA') {
      return falha.message;
    }
    if (falha.codigo === 'SERVICO_INDISPONIVEL') return textos.stripe;
  }
  return textos.padrao;
}

function NovoCupom() {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [codigo, definirCodigo] = useState('');
  const [percentual, definirPercentual] = useState('');
  const [validade, definirValidade] = useState('');
  const [aviso, definirAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, definirSalvando] = useState(false);

  const aoCriar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const numero = Number(percentual);
    if (
      !PADRAO_CODIGO_CUPOM.test(codigo) ||
      !/^\d+$/.test(percentual) ||
      numero < PERCENTUAL_CUPOM_MINIMO ||
      numero > PERCENTUAL_CUPOM_MAXIMO
    ) {
      definirAviso({ tipo: 'erro', texto: t('cupons.invalido') });
      return;
    }
    definirSalvando(true);
    try {
      const criado = await criarAdminCupons({
        codigo,
        percentual: numero,
        validade: validade === '' ? null : validade,
      });
      clienteConsultas.setQueryData<CupomAdmin[]>(getListarAdminCuponsQueryKey(), (atuais) => [
        criado,
        ...(atuais ?? []),
      ]);
      definirCodigo('');
      definirPercentual('');
      definirValidade('');
      definirAviso({ tipo: 'ok', texto: t('cupons.criado', { codigo: criado.codigo }) });
    } catch (falha) {
      definirAviso({
        tipo: 'erro',
        texto: mensagemDoErro(falha, {
          stripe: t('planos.stripeIndisponivel'),
          padrao: t('cupons.erroSalvar'),
        }),
      });
    } finally {
      definirSalvando(false);
    }
  };

  const mudou = () => {
    definirAviso(null);
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(evento) => void aoCriar(evento)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cupom-codigo">{t('cupons.codigo')}</Label>
          <Input
            id="cupom-codigo"
            autoCapitalize="characters"
            maxLength={20}
            value={codigo}
            onChange={(evento) => {
              mudou();
              definirCodigo(evento.target.value.toUpperCase());
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cupom-percentual">{t('cupons.percentual')}</Label>
          <Input
            id="cupom-percentual"
            inputMode="numeric"
            value={percentual}
            onChange={(evento) => {
              mudou();
              definirPercentual(evento.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cupom-validade">{t('cupons.validade')}</Label>
          <Input
            id="cupom-validade"
            type="date"
            value={validade}
            onChange={(evento) => {
              mudou();
              definirValidade(evento.target.value);
            }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('cupons.ajuda')}</p>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={salvando}>
          {t('cupons.criar')}
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
    </form>
  );
}

function Lista({ cupons }: { cupons: CupomAdmin[] }) {
  const { t } = useTranslation();
  if (cupons.length === 0) return <p className="text-muted-foreground">{t('cupons.nenhum')}</p>;
  return (
    <table aria-label={t('cupons.titulo')} className="w-full text-left text-sm">
      <thead className="border-b text-muted-foreground">
        <tr>
          <th className="py-2 font-medium">{t('cupons.codigo')}</th>
          <th className="py-2 font-medium">{t('cupons.desconto')}</th>
          <th className="py-2 font-medium">{t('cupons.validoAte')}</th>
          <th className="py-2 font-medium">{t('cupons.criadoPor')}</th>
          <th className="py-2 font-medium">{t('cupons.situacao')}</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody>
        {cupons.map((cupom) => (
          <LinhaCupom key={cupom.id} cupom={cupom} />
        ))}
      </tbody>
    </table>
  );
}

function LinhaCupom({ cupom }: { cupom: CupomAdmin }) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [confirmando, definirConfirmando] = useState(false);
  const [salvando, definirSalvando] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);

  const desativar = async () => {
    definirSalvando(true);
    try {
      const atualizado = await desativarAdminCupons(cupom.id);
      clienteConsultas.setQueryData<CupomAdmin[]>(getListarAdminCuponsQueryKey(), (atuais) =>
        (atuais ?? []).map((item) => (item.id === atualizado.id ? atualizado : item)),
      );
      definirConfirmando(false);
    } catch (falha) {
      definirErro(
        mensagemDoErro(falha, {
          stripe: t('planos.stripeIndisponivel'),
          padrao: t('cupons.erroSalvar'),
        }),
      );
    } finally {
      definirSalvando(false);
    }
  };

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 font-mono">{cupom.codigo}</td>
      <td className="py-2 pr-4">{`${String(cupom.percentual)}%`}</td>
      <td className="py-2 pr-4">{cupom.validade ? dia(cupom.validade) : t('cupons.semPrazo')}</td>
      <td className="py-2 pr-4">{cupom.criadoPor?.nome ?? '—'}</td>
      <td className="py-2 pr-4">{t(`cupons.situacoes.${cupom.situacao}`)}</td>
      <td className="py-2 text-right">
        {cupom.situacao === 'ativo' ? (
          confirmando ? (
            <span className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={salvando}
                onClick={() => void desativar()}
              >
                {t('cupons.confirmar')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  definirConfirmando(false);
                }}
              >
                {t('cupons.cancelar')}
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              aria-label={t('cupons.desativarCodigo', { codigo: cupom.codigo })}
              onClick={() => {
                definirErro(null);
                definirConfirmando(true);
              }}
            >
              {t('cupons.desativar')}
            </Button>
          )
        ) : null}
        {erro ? (
          <p role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
