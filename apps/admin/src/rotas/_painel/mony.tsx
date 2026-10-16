import {
  ativarAdminMony,
  avaliarAdminMony,
  criarAdminMony,
  ErroApi,
  getLimitesAdminMonyQueryKey,
  getPrecosAdminMonyQueryKey,
  getVersaoAdminMonyQueryKey,
  getVersoesAdminMonyQueryKey,
  logsAdminMony,
  salvarLimitesAdminMony,
  salvarPrecosAdminMony,
  useCustoAdminMony,
  useLimitesAdminMony,
  usePrecosAdminMony,
  useVersaoAdminMony,
  useVersoesAdminMony,
} from '@mony/api-client';
import {
  LIMITE_MONY_MAXIMO,
  type LimitesMony,
  type LogsMonyAdmin,
  PROMPT_MONY_MAXIMO,
  type PrecoModeloIa,
  type VersaoMonyAdmin,
  type VersaoMonyResumoAdmin,
} from '@mony/shared/admin';
import { dataNoFuso } from '@mony/shared/datas';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/mony')({ component: Mony });

const CLASSE_TEXTAREA =
  'rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
/** Enquanto alguma avaliação roda, a lista é relida a cada 10 s. */
const RELER_AVALIACAO_MS = 10_000;

const DOLARES = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
const NUMERO = new Intl.NumberFormat('pt-BR');
const SEGUNDOS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const dolares = (centavos: number) => DOLARES.format(centavos / 100);

type Aviso = { tipo: 'ok' | 'erro'; texto: string } | null;

/** Conflito e dado inválido trazem a frase da API; o resto, o texto do painel. */
function mensagemDoErro(falha: unknown, padrao: string): string {
  if (
    falha instanceof ErroApi &&
    (falha.codigo === 'CONFLITO' || falha.codigo === 'REQUISICAO_INVALIDA')
  ) {
    return falha.message;
  }
  return padrao;
}

function TextoAviso({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p
      role={aviso.tipo === 'erro' ? 'alert' : 'status'}
      className={
        aviso.tipo === 'erro' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'
      }
    >
      {aviso.texto}
    </p>
  );
}

/**
 * Mony (T-141e, doc 13): versões do prompt do sistema (editar, avaliar com as frases de teste no
 * worker e ativar com 95% ou mais, doc 08), chamadas ao modelo com erro e custo por período pela
 * tabela de preços.
 */
function Mony() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.mony')}</h1>
      <Versoes />
      <Custo />
      <Limites />
      <Logs />
    </div>
  );
}

function Versoes() {
  const { t } = useTranslation();
  const consulta = useVersoesAdminMony({
    query: {
      refetchInterval: (query) =>
        query.state.data?.itens.some(
          ({ situacaoAvaliacao }) => situacaoAvaliacao === 'em_andamento',
        )
          ? RELER_AVALIACAO_MS
          : false,
    },
  });
  const [escolhida, definirEscolhida] = useState<number | null>(null);
  if (!consulta.data) {
    return (
      <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
        {consulta.isError ? t('mony.erroCarregar') : t('mony.carregando')}
      </p>
    );
  }
  const { itens, versaoAtiva, minimoAvaliacao, avaliacaoDisponivel } = consulta.data;
  const versao = escolhida ?? versaoAtiva ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('mony.prompt')}</h2>
        </CardTitle>
        <CardDescription>
          {t('mony.descricaoPrompt', { minimo: minimoAvaliacao })}{' '}
          {versaoAtiva === null
            ? t('mony.semVersaoAtiva')
            : t('mony.versaoAtiva', { versao: versaoAtiva })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!avaliacaoDisponivel ? (
          <p className="text-sm text-muted-foreground">{t('mony.modeloFalso')}</p>
        ) : null}
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('mony.nenhumaVersao')}</p>
        ) : (
          <table aria-label={t('mony.versoes')} className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">{t('mony.versao')}</th>
                <th className="py-2 font-medium">{t('mony.modelo')}</th>
                <th className="py-2 font-medium">{t('mony.criada')}</th>
                <th className="py-2 font-medium">{t('mony.avaliacao')}</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <LinhaVersao
                  key={item.versao}
                  item={item}
                  escolhida={item.versao === versao}
                  avaliacaoDisponivel={avaliacaoDisponivel}
                  aoVer={definirEscolhida}
                />
              ))}
            </tbody>
          </table>
        )}
        <Editor
          key={versao}
          versao={versao}
          aoCriar={(nova) => {
            definirEscolhida(nova);
          }}
        />
      </CardContent>
    </Card>
  );
}

function ResumoAvaliacao({ item }: { item: VersaoMonyResumoAdmin }) {
  const { t } = useTranslation();
  const resultado = item.avaliacao
    ? t('mony.resultado', {
        percentual: item.avaliacao.percentual,
        aprovados: item.avaliacao.aprovados,
        total: item.avaliacao.total,
      })
    : null;
  if (item.situacaoAvaliacao === 'concluida') return <span>{resultado}</span>;
  return (
    <span>
      {t(`mony.situacoes.${item.situacaoAvaliacao}`)}
      {resultado ? ` (${t('mony.anterior', { resultado })})` : ''}
    </span>
  );
}

function LinhaVersao({
  item,
  escolhida,
  avaliacaoDisponivel,
  aoVer,
}: {
  item: VersaoMonyResumoAdmin;
  escolhida: boolean;
  avaliacaoDisponivel: boolean;
  aoVer: (versao: number) => void;
}) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [aviso, definirAviso] = useState<Aviso>(null);
  const [salvando, definirSalvando] = useState(false);

  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    definirSalvando(true);
    definirAviso(null);
    try {
      await acao();
      await Promise.all([
        clienteConsultas.invalidateQueries({ queryKey: getVersoesAdminMonyQueryKey() }),
        clienteConsultas.invalidateQueries({ queryKey: getVersaoAdminMonyQueryKey(item.versao) }),
      ]);
      definirAviso({ tipo: 'ok', texto: sucesso });
    } catch (falha) {
      definirAviso({ tipo: 'erro', texto: mensagemDoErro(falha, t('mony.erroSalvar')) });
    } finally {
      definirSalvando(false);
    }
  };

  return (
    <tr className={escolhida ? 'border-b bg-muted/50' : 'border-b'}>
      <td className="py-2 pr-4">
        {item.versao}
        {item.ativa ? ` · ${t('mony.ativa')}` : ''}
      </td>
      <td className="py-2 pr-4 font-mono text-xs">{item.modelo}</td>
      <td className="py-2 pr-4">
        {FORMATO_DATA.format(new Date(item.criadoEm))}
        {item.criadoPor ? ` · ${item.criadoPor.nome}` : ''}
      </td>
      <td className="py-2 pr-4">
        <ResumoAvaliacao item={item} />
      </td>
      <td className="py-2">
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={t('mony.verVersao', { versao: item.versao })}
            onClick={() => {
              aoVer(item.versao);
            }}
          >
            {t('mony.ver')}
          </Button>
          {avaliacaoDisponivel && item.situacaoAvaliacao !== 'em_andamento' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={salvando}
              aria-label={t('mony.avaliarVersao', { versao: item.versao })}
              onClick={() =>
                void executar(() => avaliarAdminMony(item.versao), t('mony.avaliacaoPedida'))
              }
            >
              {t('mony.avaliar')}
            </Button>
          ) : null}
          {item.podeAtivar ? (
            <Button
              size="sm"
              disabled={salvando}
              aria-label={t('mony.ativarVersao', { versao: item.versao })}
              onClick={() =>
                void executar(
                  () => ativarAdminMony(item.versao),
                  t('mony.ativada', { versao: item.versao }),
                )
              }
            >
              {t('mony.ativar')}
            </Button>
          ) : null}
        </div>
        <TextoAviso aviso={aviso} />
      </td>
    </tr>
  );
}

/** O prompt da versão escolhida (ou o do código, a versão 0); salvar grava uma versão nova. */
function Editor({ versao, aoCriar }: { versao: number; aoCriar: (versao: number) => void }) {
  const { t } = useTranslation();
  const consulta = useVersaoAdminMony(versao);
  if (!consulta.data) {
    return (
      <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
        {consulta.isError ? t('mony.erroCarregar') : t('mony.carregando')}
      </p>
    );
  }
  return <FormularioVersao base={consulta.data} aoCriar={aoCriar} />;
}

function FormularioVersao({
  base,
  aoCriar,
}: {
  base: VersaoMonyAdmin;
  aoCriar: (versao: number) => void;
}) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [prompt, definirPrompt] = useState(base.promptSistema);
  const [modelo, definirModelo] = useState(base.modelo);
  const [aviso, definirAviso] = useState<Aviso>(null);
  const [salvando, definirSalvando] = useState(false);
  const falhas = base.casos.filter(({ passou }) => !passou);

  const aoSalvar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (!prompt.trim()) {
      definirAviso({ tipo: 'erro', texto: t('mony.promptVazio') });
      return;
    }
    definirSalvando(true);
    try {
      const criada = await criarAdminMony({
        promptSistema: prompt,
        descricoes: base.descricoes,
        modelo: modelo.trim() || null,
      });
      await clienteConsultas.invalidateQueries({ queryKey: getVersoesAdminMonyQueryKey() });
      aoCriar(criada.versao);
    } catch (falha) {
      definirAviso({ tipo: 'erro', texto: mensagemDoErro(falha, t('mony.erroSalvar')) });
      definirSalvando(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={(evento) => void aoSalvar(evento)}>
      <h3 className="font-semibold">
        {base.versao === 0 ? t('mony.promptDoCodigo') : t('mony.versaoN', { versao: base.versao })}
      </h3>
      {base.avaliacaoFalha ? (
        <p role="alert" className="text-sm text-destructive">
          {t('mony.avaliacaoFalhou', { motivo: base.avaliacaoFalha })}
        </p>
      ) : null}
      {falhas.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            {t('mony.frasesQueFalharam', { quantidade: falhas.length })}
          </p>
          <ul aria-label={t('mony.frasesQueFalharam', { quantidade: falhas.length })}>
            {falhas.map((caso) => (
              <li key={caso.id} className="text-muted-foreground">
                <span className="font-mono text-xs">{caso.id}</span>: {caso.motivos.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="mony-prompt">{t('mony.promptSistema')}</Label>
        <textarea
          id="mony-prompt"
          rows={16}
          maxLength={PROMPT_MONY_MAXIMO}
          className={CLASSE_TEXTAREA}
          value={prompt}
          onChange={(evento) => {
            definirAviso(null);
            definirPrompt(evento.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="mony-modelo">{t('mony.modelo')}</Label>
        <Input
          id="mony-modelo"
          className="w-80 font-mono"
          value={modelo}
          onChange={(evento) => {
            definirAviso(null);
            definirModelo(evento.target.value);
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t('mony.explicacaoSalvar')}</p>
      <Button type="submit" className="self-start" disabled={salvando}>
        {t('mony.salvarNovaVersao')}
      </Button>
      <TextoAviso aviso={aviso} />
    </form>
  );
}

/** O primeiro dia do mês de hoje, em São Paulo. */
function inicioDoMes(): string {
  return `${dataNoFuso(new Date()).slice(0, 8)}01`;
}

function Custo() {
  const { t } = useTranslation();
  const [rascunho, definirRascunho] = useState({ de: inicioDoMes(), ate: dataNoFuso(new Date()) });
  const [periodo, definirPeriodo] = useState(rascunho);
  const [erro, definirErro] = useState<string | null>(null);
  const consulta = useCustoAdminMony(periodo);

  const aoFiltrar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (!rascunho.de || !rascunho.ate || rascunho.de > rascunho.ate) {
      definirErro(t('mony.periodoInvalido'));
      return;
    }
    definirPeriodo(rascunho);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('mony.custo')}</h2>
        </CardTitle>
        <CardDescription>{t('mony.descricaoCusto')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-wrap items-end gap-4" onSubmit={aoFiltrar}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="custo-de">{t('mony.de')}</Label>
            <Input
              id="custo-de"
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
            <Label htmlFor="custo-ate">{t('mony.ate')}</Label>
            <Input
              id="custo-ate"
              type="date"
              className="w-40"
              value={rascunho.ate}
              onChange={(evento) => {
                definirErro(null);
                definirRascunho({ ...rascunho, ate: evento.target.value });
              }}
            />
          </div>
          <Button type="submit">{t('mony.verPeriodo')}</Button>
        </form>
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        {consulta.data ? (
          <>
            <p className="text-lg font-semibold">
              {t('mony.total', {
                valor: dolares(consulta.data.totalCentavos),
                chamadas: NUMERO.format(consulta.data.chamadas),
                erros: NUMERO.format(consulta.data.chamadasComErro),
              })}
            </p>
            {consulta.data.modelosSemPreco.length > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                {t('mony.semPreco', { modelos: consulta.data.modelosSemPreco.join(', ') })}
              </p>
            ) : null}
            {consulta.data.modelos.length > 0 ? (
              <table aria-label={t('mony.custoPorModelo')} className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">{t('mony.modelo')}</th>
                    <th className="py-2 font-medium">{t('mony.chamadas')}</th>
                    <th className="py-2 font-medium">{t('mony.tokensEntrada')}</th>
                    <th className="py-2 font-medium">{t('mony.tokensSaida')}</th>
                    <th className="py-2 font-medium">{t('mony.custoColuna')}</th>
                  </tr>
                </thead>
                <tbody>
                  {consulta.data.modelos.map((modelo) => (
                    <tr key={modelo.modelo} className="border-b">
                      <td className="py-2 pr-4 font-mono text-xs">{modelo.modelo}</td>
                      <td className="py-2 pr-4">{NUMERO.format(modelo.chamadas)}</td>
                      <td className="py-2 pr-4">{NUMERO.format(modelo.tokensEntrada)}</td>
                      <td className="py-2 pr-4">{NUMERO.format(modelo.tokensSaida)}</td>
                      <td className="py-2">
                        {modelo.custoCentavos === null
                          ? t('mony.semPrecoCelula')
                          : dolares(modelo.custoCentavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">{t('mony.semChamadas')}</p>
            )}
          </>
        ) : (
          <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
            {consulta.isError ? t('mony.erroCarregar') : t('mony.carregando')}
          </p>
        )}
        <Precos sugeridos={consulta.data?.modelosSemPreco ?? []} />
      </CardContent>
    </Card>
  );
}

interface LinhaPreco {
  modelo: string;
  entrada: string;
  saida: string;
}

/** "3,00" → 300 centavos; vazio ou inválido → null. */
function centavos(texto: string): number | null {
  const normalizado = texto.trim().replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return Math.round(Number(normalizado) * 100);
}

const paraTexto = (valor: number) => (valor / 100).toFixed(2).replace('.', ',');

function Precos({ sugeridos }: { sugeridos: readonly string[] }) {
  const consulta = usePrecosAdminMony();
  if (!consulta.data) return null;
  return <FormularioPrecos salvos={consulta.data.precos} sugeridos={sugeridos} />;
}

function FormularioPrecos({
  salvos,
  sugeridos,
}: {
  salvos: readonly PrecoModeloIa[];
  sugeridos: readonly string[];
}) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [linhas, definirLinhas] = useState<LinhaPreco[]>(
    salvos.map((preco) => ({
      modelo: preco.modelo,
      entrada: paraTexto(preco.entradaCentavosPorMilhao),
      saida: paraTexto(preco.saidaCentavosPorMilhao),
    })),
  );
  const [aviso, definirAviso] = useState<Aviso>(null);
  const [salvando, definirSalvando] = useState(false);
  const faltando = sugeridos.filter((modelo) => !linhas.some((linha) => linha.modelo === modelo));

  const mudar = (indice: number, campo: keyof LinhaPreco, valor: string) => {
    definirAviso(null);
    definirLinhas(linhas.map((linha, i) => (i === indice ? { ...linha, [campo]: valor } : linha)));
  };

  const aoSalvar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const precos: PrecoModeloIa[] = [];
    for (const linha of linhas) {
      const entrada = centavos(linha.entrada);
      const saida = centavos(linha.saida);
      if (!linha.modelo.trim() || entrada === null || saida === null) {
        definirAviso({ tipo: 'erro', texto: t('mony.precoInvalido') });
        return;
      }
      precos.push({
        modelo: linha.modelo.trim(),
        entradaCentavosPorMilhao: entrada,
        saidaCentavosPorMilhao: saida,
      });
    }
    definirSalvando(true);
    try {
      await salvarPrecosAdminMony({ precos });
      await clienteConsultas.invalidateQueries({ queryKey: getPrecosAdminMonyQueryKey() });
      await clienteConsultas.invalidateQueries({ queryKey: ['/v1/admin/mony/custo'] });
      definirAviso({ tipo: 'ok', texto: t('mony.precosSalvos') });
    } catch (falha) {
      definirAviso({ tipo: 'erro', texto: mensagemDoErro(falha, t('mony.erroSalvar')) });
    } finally {
      definirSalvando(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 border-t pt-4"
      onSubmit={(evento) => void aoSalvar(evento)}
    >
      <h3 className="font-semibold">{t('mony.precos')}</h3>
      <p className="text-sm text-muted-foreground">{t('mony.descricaoPrecos')}</p>
      {linhas.map((linha, indice) => (
        <div key={indice} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`preco-modelo-${String(indice)}`}>{t('mony.modelo')}</Label>
            <Input
              id={`preco-modelo-${String(indice)}`}
              className="w-72 font-mono"
              value={linha.modelo}
              onChange={(evento) => {
                mudar(indice, 'modelo', evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`preco-entrada-${String(indice)}`}>{t('mony.precoEntrada')}</Label>
            <Input
              id={`preco-entrada-${String(indice)}`}
              inputMode="decimal"
              className="w-32"
              value={linha.entrada}
              onChange={(evento) => {
                mudar(indice, 'entrada', evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`preco-saida-${String(indice)}`}>{t('mony.precoSaida')}</Label>
            <Input
              id={`preco-saida-${String(indice)}`}
              inputMode="decimal"
              className="w-32"
              value={linha.saida}
              onChange={(evento) => {
                mudar(indice, 'saida', evento.target.value);
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            aria-label={t('mony.removerPreco', { modelo: linha.modelo || String(indice + 1) })}
            onClick={() => {
              definirAviso(null);
              definirLinhas(linhas.filter((_, i) => i !== indice));
            }}
          >
            {t('mony.remover')}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {faltando.map((modelo) => (
          <Button
            key={modelo}
            type="button"
            variant="outline"
            onClick={() => {
              definirLinhas([...linhas, { modelo, entrada: '', saida: '' }]);
            }}
          >
            {t('mony.adicionarModelo', { modelo })}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            definirLinhas([...linhas, { modelo: '', entrada: '', saida: '' }]);
          }}
        >
          {t('mony.adicionarPreco')}
        </Button>
        <Button type="submit" disabled={salvando}>
          {t('mony.salvarPrecos')}
        </Button>
      </div>
      <TextoAviso aviso={aviso} />
    </form>
  );
}

/** T-151: mensagens e leituras por usuário por dia, em todos os planos. */
function Limites() {
  const { t } = useTranslation();
  const consulta = useLimitesAdminMony();
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('mony.limites')}</h2>
        </CardTitle>
        <CardDescription>{t('mony.descricaoLimites')}</CardDescription>
      </CardHeader>
      <CardContent>
        {consulta.data ? (
          <FormularioLimites salvos={consulta.data} />
        ) : (
          <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
            {consulta.isError ? t('mony.erroCarregar') : t('mony.carregando')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const CAMPOS_LIMITES = ['mensagensPorDia', 'leiturasPorDia'] as const;

function FormularioLimites({ salvos }: { salvos: LimitesMony }) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [valores, definirValores] = useState({
    mensagensPorDia: String(salvos.mensagensPorDia),
    leiturasPorDia: String(salvos.leiturasPorDia),
  });
  const [aviso, definirAviso] = useState<Aviso>(null);
  const [salvando, definirSalvando] = useState(false);

  const aoSalvar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const lidos = CAMPOS_LIMITES.map((campo) => valores[campo].trim());
    const [mensagensPorDia, leiturasPorDia] = lidos.map(Number) as [number, number];
    const valido = (texto: string) =>
      /^\d+$/.test(texto) && Number(texto) >= 1 && Number(texto) <= LIMITE_MONY_MAXIMO;
    if (!lidos.every(valido)) {
      definirAviso({
        tipo: 'erro',
        texto: t('mony.limiteInvalido', { maximo: LIMITE_MONY_MAXIMO }),
      });
      return;
    }
    definirSalvando(true);
    try {
      await salvarLimitesAdminMony({ mensagensPorDia, leiturasPorDia });
      await clienteConsultas.invalidateQueries({ queryKey: getLimitesAdminMonyQueryKey() });
      definirAviso({ tipo: 'ok', texto: t('mony.limitesSalvos') });
    } catch (falha) {
      definirAviso({ tipo: 'erro', texto: mensagemDoErro(falha, t('mony.erroSalvar')) });
    } finally {
      definirSalvando(false);
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(evento) => void aoSalvar(evento)}>
      <div className="flex flex-wrap items-end gap-4">
        {CAMPOS_LIMITES.map((campo) => (
          <div key={campo} className="flex flex-col gap-1">
            <Label htmlFor={`limite-${campo}`}>{t(`mony.${campo}`)}</Label>
            <Input
              id={`limite-${campo}`}
              inputMode="numeric"
              className="w-40"
              value={valores[campo]}
              onChange={(evento) => {
                definirAviso(null);
                definirValores({ ...valores, [campo]: evento.target.value });
              }}
            />
          </div>
        ))}
        <Button type="submit" disabled={salvando}>
          {t('mony.salvarLimites')}
        </Button>
      </div>
      <TextoAviso aviso={aviso} />
    </form>
  );
}

function Logs() {
  const { t } = useTranslation();
  const [rascunho, definirRascunho] = useState({ de: '', ate: '' });
  const [filtros, definirFiltros] = useState<{ de?: string; ate?: string }>({});
  const [erro, definirErro] = useState<string | null>(null);
  const consulta = useInfiniteQuery({
    queryKey: ['/v1/admin/mony/logs', filtros],
    queryFn: ({ pageParam }) =>
      logsAdminMony({ ...filtros, ...(pageParam ? { cursor: pageParam } : {}), limite: 50 }),
    initialPageParam: '',
    getNextPageParam: (pagina: LogsMonyAdmin) => pagina.proximoCursor ?? undefined,
  });
  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? [];

  const aoFiltrar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (rascunho.de && rascunho.ate && rascunho.de > rascunho.ate) {
      definirErro(t('mony.periodoInvalido'));
      return;
    }
    definirFiltros({
      ...(rascunho.de ? { de: rascunho.de } : {}),
      ...(rascunho.ate ? { ate: rascunho.ate } : {}),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('mony.logs')}</h2>
        </CardTitle>
        <CardDescription>{t('mony.descricaoLogs')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-wrap items-end gap-4" onSubmit={aoFiltrar}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="logs-de">{t('mony.de')}</Label>
            <Input
              id="logs-de"
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
            <Label htmlFor="logs-ate">{t('mony.ate')}</Label>
            <Input
              id="logs-ate"
              type="date"
              className="w-40"
              value={rascunho.ate}
              onChange={(evento) => {
                definirErro(null);
                definirRascunho({ ...rascunho, ate: evento.target.value });
              }}
            />
          </div>
          <Button type="submit">{t('mony.filtrar')}</Button>
        </form>
        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}
        {consulta.isError ? (
          <p role="alert" className="text-destructive">
            {t('mony.erroCarregar')}
          </p>
        ) : consulta.isPending ? (
          <p className="text-muted-foreground">{t('mony.carregando')}</p>
        ) : itens.length === 0 ? (
          <p className="text-muted-foreground">{t('mony.nenhumErro')}</p>
        ) : (
          <>
            <table aria-label={t('mony.logs')} className="w-full text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t('mony.quando')}</th>
                  <th className="py-2 font-medium">{t('mony.usuario')}</th>
                  <th className="py-2 font-medium">{t('mony.mensagem')}</th>
                  <th className="py-2 font-medium">{t('mony.erro')}</th>
                  <th className="py-2 font-medium">{t('mony.modelo')}</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((log) => (
                  <tr key={log.id} className="border-b align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {FORMATO_DATA.format(new Date(log.criadoEm))}
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        to="/usuarios/$id"
                        params={{ id: log.usuario.id }}
                        className="underline-offset-4 hover:underline"
                      >
                        {log.usuario.nome}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{log.mensagem ?? t('mony.semMensagem')}</td>
                    <td className="py-2 pr-4 text-destructive">
                      {log.erro}
                      {log.ferramenta ? (
                        <span className="block font-mono text-xs text-muted-foreground">
                          {log.ferramenta}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 font-mono text-xs">
                      {log.modelo}
                      <span className="block text-muted-foreground">
                        {t('mony.duracao', { segundos: SEGUNDOS.format(log.duracaoMs / 1000) })}
                      </span>
                    </td>
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
                {t('mony.carregarMais')}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
