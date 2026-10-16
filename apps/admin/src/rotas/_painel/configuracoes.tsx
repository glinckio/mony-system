import {
  getLerAdminConfiguracoesQueryKey,
  salvarAdminConfiguracoes,
  useLerAdminConfiguracoes,
} from '@mony/api-client';
import { type ConfiguracoesAdmin, esquemaParametros, type Parametros } from '@mony/shared/admin';
import { formatarCentavos, textoParaCentavos } from '@mony/shared/dinheiro';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/configuracoes')({ component: Configuracoes });

type Campo =
  | 'cotaConsultoriaDiaria'
  | 'intervaloAppCompraHoras'
  | 'multiplo'
  | 'minimoDeLancamentos'
  | 'valorMinimo'
  | 'limiteLigacoes'
  | 'versaoIos'
  | 'versaoAndroid'
  | 'custoIaDiario'
  | 'filaParadaMinutos'
  | 'diasArquivos';
/** O formulário guarda texto. */
type Campos = Record<Campo, string>;

function camposDe({
  alertas,
  ligacoes,
  versaoMinima,
  monitoramento,
  retencao,
}: Parametros): Campos {
  return {
    cotaConsultoriaDiaria: String(alertas.cotaConsultoriaDiaria),
    intervaloAppCompraHoras: String(alertas.intervaloAppCompraHoras),
    multiplo: String(alertas.foraDoPadrao.multiplo),
    minimoDeLancamentos: String(alertas.foraDoPadrao.minimoDeLancamentos),
    valorMinimo: formatarCentavos(alertas.foraDoPadrao.valorMinimoCentavos, { simbolo: false }),
    limiteLigacoes: String(ligacoes.limiteMensal),
    versaoIos: versaoMinima.ios,
    versaoAndroid: versaoMinima.android,
    custoIaDiario: formatarCentavos(monitoramento.custoIaDiarioCentavos, { simbolo: false }),
    filaParadaMinutos: String(monitoramento.filaParadaMinutos),
    diasArquivos: String(retencao.diasArquivos),
  };
}

const inteiro = (texto: string) => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : NaN);

/** `null`: algum campo fora do formato ou dos limites do esquema. */
function parametrosDe(campos: Campos): Parametros | null {
  const lidos = esquemaParametros.safeParse({
    alertas: {
      cotaConsultoriaDiaria: inteiro(campos.cotaConsultoriaDiaria),
      intervaloAppCompraHoras: inteiro(campos.intervaloAppCompraHoras),
      foraDoPadrao: {
        multiplo: inteiro(campos.multiplo),
        minimoDeLancamentos: inteiro(campos.minimoDeLancamentos),
        valorMinimoCentavos: textoParaCentavos(campos.valorMinimo) ?? NaN,
      },
    },
    ligacoes: { limiteMensal: inteiro(campos.limiteLigacoes) },
    versaoMinima: { ios: campos.versaoIos.trim(), android: campos.versaoAndroid.trim() },
    monitoramento: {
      custoIaDiarioCentavos: textoParaCentavos(campos.custoIaDiario) ?? NaN,
      filaParadaMinutos: inteiro(campos.filaParadaMinutos),
    },
    retencao: { diasArquivos: inteiro(campos.diasArquivos) },
  });
  return lidos.success ? lidos.data : null;
}

/**
 * Configurações (T-141g, doc 13): parâmetros dos alertas (RN-103, RN-104, RN-106), limite mensal
 * de ligações (RN-078), versão mínima do app, limites dos alertas técnicos (T-142a) e prazo de
 * retenção de fotos, documentos e áudios (RN-162, T-140c). Valem na
 * API e no worker em até 30 s.
 */
function Configuracoes() {
  const { t } = useTranslation();
  const consulta = useLerAdminConfiguracoes();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.configuracoes')}</h1>
      {consulta.data ? (
        <Formulario configuracoes={consulta.data} />
      ) : (
        <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
          {consulta.isError ? t('configuracoes.erroCarregar') : t('configuracoes.carregando')}
        </p>
      )}
    </div>
  );
}

function Formulario({ configuracoes }: { configuracoes: ConfiguracoesAdmin }) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [campos, definirCampos] = useState<Campos>(() => camposDe(configuracoes.parametros));
  const [aviso, definirAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, definirSalvando] = useState(false);

  const campo = (chave: Campo, ajuda?: string) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`configuracao-${chave}`}>{t(`configuracoes.campos.${chave}`)}</Label>
      <Input
        id={`configuracao-${chave}`}
        className="w-40"
        inputMode={chave.startsWith('versao') ? 'text' : 'numeric'}
        value={campos[chave]}
        onChange={(evento) => {
          definirAviso(null);
          definirCampos((atuais) => ({ ...atuais, [chave]: evento.target.value }));
        }}
      />
      {ajuda ? <p className="max-w-xs text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );

  const aoSalvar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const parametros = parametrosDe(campos);
    if (!parametros) {
      definirAviso({ tipo: 'erro', texto: t('configuracoes.invalido') });
      return;
    }
    definirSalvando(true);
    try {
      const salvas = await salvarAdminConfiguracoes(parametros);
      clienteConsultas.setQueryData(getLerAdminConfiguracoesQueryKey(), salvas);
      definirCampos(camposDe(salvas.parametros));
      definirAviso({ tipo: 'ok', texto: t('configuracoes.salvas') });
    } catch {
      definirAviso({ tipo: 'erro', texto: t('configuracoes.erroSalvar') });
    } finally {
      definirSalvando(false);
    }
  };

  return (
    <form className="flex max-w-3xl flex-col gap-6" onSubmit={(evento) => void aoSalvar(evento)}>
      <p className="text-sm text-muted-foreground">
        {configuracoes.alteradoEm && configuracoes.alteradoPor
          ? t('configuracoes.alteradas', {
              quando: FORMATO_DATA.format(new Date(configuracoes.alteradoEm)),
              quem: configuracoes.alteradoPor.nome,
            })
          : t('configuracoes.padroes')}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('configuracoes.alertas')}</h2>
          </CardTitle>
          <CardDescription>{t('configuracoes.explicacaoAlertas')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {campo('cotaConsultoriaDiaria', t('configuracoes.ajuda.cotaConsultoriaDiaria'))}
          {campo('intervaloAppCompraHoras', t('configuracoes.ajuda.intervaloAppCompraHoras'))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('configuracoes.foraDoPadrao')}</h2>
          </CardTitle>
          <CardDescription>{t('configuracoes.explicacaoForaDoPadrao')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {campo('multiplo')}
          {campo('minimoDeLancamentos')}
          {campo('valorMinimo')}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('configuracoes.ligacoesEApp')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {campo('limiteLigacoes', t('configuracoes.ajuda.limiteLigacoes'))}
          {campo('versaoIos', t('configuracoes.ajuda.versao'))}
          {campo('versaoAndroid', t('configuracoes.ajuda.versao'))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('configuracoes.monitoramento')}</h2>
          </CardTitle>
          <CardDescription>{t('configuracoes.explicacaoMonitoramento')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {campo('custoIaDiario', t('configuracoes.ajuda.custoIaDiario'))}
          {campo('filaParadaMinutos', t('configuracoes.ajuda.filaParadaMinutos'))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('configuracoes.retencao')}</h2>
          </CardTitle>
          <CardDescription>{t('configuracoes.explicacaoRetencao')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          {campo('diasArquivos', t('configuracoes.ajuda.diasArquivos'))}
        </CardContent>
      </Card>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={salvando}>
          {t('configuracoes.salvar')}
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
