import {
  criarAdminNovidades,
  desativarAdminNovidades,
  editarAdminNovidades,
  ErroApi,
  getListarAdminNovidadesQueryKey,
  publicarAdminNovidades,
  useListarAdminNovidades,
} from '@mony/api-client';
import {
  DESCRICAO_NOVIDADE_MAXIMO,
  type NovaNovidade,
  type NovidadeAdmin,
  PADRAO_VIDEO_NOVIDADE,
  TITULO_NOVIDADE_MAXIMO,
} from '@mony/shared/admin';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/novidades')({ component: Novidades });

const FORMATO_DIA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' });
const dia = (data: string) => FORMATO_DIA.format(new Date(`${data}T12:00:00Z`));

type Aviso = { tipo: 'ok' | 'erro'; texto: string } | null;

interface Rascunho {
  titulo: string;
  descricao: string;
  videoUrl: string;
  validade: string;
  enviarPush: boolean;
}

const VAZIO: Rascunho = {
  titulo: '',
  descricao: '',
  videoUrl: '',
  validade: '',
  enviarPush: false,
};

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

/**
 * Novidades (T-141d, doc 13): comunicados com título, texto, vídeo (YouTube ou Vimeo) e validade.
 * Nascem como rascunho; publicar põe no ar agora ou na data agendada, e o push, se pedido, sai
 * quando a novidade entra no ar.
 */
function Novidades() {
  const { t } = useTranslation();
  const consulta = useListarAdminNovidades();
  const [editando, definirEditando] = useState<NovidadeAdmin | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('secoes.novidades')}</h1>
      <Formulario
        key={editando?.id ?? 'nova'}
        editando={editando}
        aoTerminar={() => {
          definirEditando(null);
        }}
      />
      {consulta.data ? (
        consulta.data.length === 0 ? (
          <p className="text-muted-foreground">{t('novidades.nenhuma')}</p>
        ) : (
          <div className="flex max-w-3xl flex-col gap-4">
            {consulta.data.map((novidade) => (
              <Item key={novidade.id} novidade={novidade} aoEditar={definirEditando} />
            ))}
          </div>
        )
      ) : (
        <p className={consulta.isError ? 'text-destructive' : 'text-muted-foreground'}>
          {consulta.isError ? t('novidades.erroCarregar') : t('novidades.carregando')}
        </p>
      )}
    </div>
  );
}

function Formulario({
  editando,
  aoTerminar,
}: {
  editando: NovidadeAdmin | null;
  aoTerminar: () => void;
}) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [rascunho, definirRascunho] = useState<Rascunho>(
    editando
      ? {
          titulo: editando.titulo,
          descricao: editando.descricao,
          videoUrl: editando.videoUrl ?? '',
          validade: editando.validade ?? '',
          enviarPush: editando.enviarPush,
        }
      : VAZIO,
  );
  const [aviso, definirAviso] = useState<Aviso>(null);
  const [salvando, definirSalvando] = useState(false);

  const mudar = <K extends keyof Rascunho>(chave: K, valor: Rascunho[K]) => {
    definirAviso(null);
    definirRascunho({ ...rascunho, [chave]: valor });
  };

  const aoSalvar = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const dados: NovaNovidade = {
      titulo: rascunho.titulo.trim(),
      descricao: rascunho.descricao.trim(),
      videoUrl: rascunho.videoUrl.trim() || null,
      validade: rascunho.validade || null,
      enviarPush: rascunho.enviarPush,
    };
    if (!dados.titulo || !dados.descricao) {
      definirAviso({ tipo: 'erro', texto: t('novidades.preenchaTituloTexto') });
      return;
    }
    if (dados.videoUrl && !PADRAO_VIDEO_NOVIDADE.test(dados.videoUrl)) {
      definirAviso({ tipo: 'erro', texto: t('novidades.videoInvalido') });
      return;
    }
    definirSalvando(true);
    try {
      if (editando) await editarAdminNovidades(editando.id, dados);
      else await criarAdminNovidades(dados);
      await clienteConsultas.invalidateQueries({ queryKey: getListarAdminNovidadesQueryKey() });
      definirRascunho(VAZIO);
      definirAviso({ tipo: 'ok', texto: editando ? t('novidades.salva') : t('novidades.criada') });
      if (editando) aoTerminar();
    } catch (falha) {
      definirAviso({ tipo: 'erro', texto: mensagemDoErro(falha, t('novidades.erroSalvar')) });
    } finally {
      definirSalvando(false);
    }
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <h2>{editando ? t('novidades.editar') : t('novidades.nova')}</h2>
        </CardTitle>
        <CardDescription>{t('novidades.descricaoFormulario')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={(evento) => void aoSalvar(evento)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="novidade-titulo">{t('novidades.titulo')}</Label>
            <Input
              id="novidade-titulo"
              maxLength={TITULO_NOVIDADE_MAXIMO}
              value={rascunho.titulo}
              onChange={(evento) => {
                mudar('titulo', evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="novidade-texto">{t('novidades.texto')}</Label>
            <textarea
              id="novidade-texto"
              rows={5}
              maxLength={DESCRICAO_NOVIDADE_MAXIMO}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={rascunho.descricao}
              onChange={(evento) => {
                mudar('descricao', evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="novidade-video">{t('novidades.video')}</Label>
              <Input
                id="novidade-video"
                placeholder="https://www.youtube.com/watch?v=…"
                value={rascunho.videoUrl}
                onChange={(evento) => {
                  mudar('videoUrl', evento.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="novidade-validade">{t('novidades.validade')}</Label>
              <Input
                id="novidade-validade"
                type="date"
                className="w-40"
                value={rascunho.validade}
                onChange={(evento) => {
                  mudar('validade', evento.target.value);
                }}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rascunho.enviarPush}
              onChange={(evento) => {
                mudar('enviarPush', evento.target.checked);
              }}
            />
            {t('novidades.enviarPush')}
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={salvando}>
              {editando ? t('novidades.salvar') : t('novidades.criarRascunho')}
            </Button>
            {editando ? (
              <Button type="button" variant="outline" onClick={aoTerminar}>
                {t('novidades.cancelar')}
              </Button>
            ) : null}
          </div>
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
        </form>
      </CardContent>
    </Card>
  );
}

function Item({
  novidade,
  aoEditar,
}: {
  novidade: NovidadeAdmin;
  aoEditar: (novidade: NovidadeAdmin) => void;
}) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [quando, definirQuando] = useState('');
  const [aviso, definirAviso] = useState<Aviso>(null);
  const [salvando, definirSalvando] = useState(false);
  const podePublicar = novidade.situacao === 'rascunho' || novidade.situacao === 'agendada';
  const podeEditar = novidade.situacao !== 'desativada';

  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    definirSalvando(true);
    try {
      await acao();
      await clienteConsultas.invalidateQueries({ queryKey: getListarAdminNovidadesQueryKey() });
      definirAviso({ tipo: 'ok', texto: sucesso });
    } catch (falha) {
      definirAviso({ tipo: 'erro', texto: mensagemDoErro(falha, t('novidades.erroSalvar')) });
    } finally {
      definirSalvando(false);
    }
  };

  const aoAgendar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    const data = new Date(quando);
    if (!quando || Number.isNaN(data.getTime())) {
      definirAviso({ tipo: 'erro', texto: t('novidades.escolhaData') });
      return;
    }
    void executar(
      () => publicarAdminNovidades(novidade.id, { publicarEm: data.toISOString() }),
      t('novidades.agendadaPara', { quando: FORMATO_DATA.format(data) }),
    );
  };

  return (
    <article aria-label={novidade.titulo} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{novidade.titulo}</h3>
        <span className="text-sm text-muted-foreground">
          {t(`novidades.situacoes.${novidade.situacao}`)}
        </span>
      </div>
      <p className="whitespace-pre-line text-sm">{novidade.descricao}</p>
      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        {novidade.videoUrl ? (
          <div>
            <dt className="inline">{t('novidades.video')}: </dt>
            <dd className="inline break-all">{novidade.videoUrl}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline">{t('novidades.publicadaEm')}: </dt>
          <dd className="inline">
            {novidade.publicadaEm
              ? FORMATO_DATA.format(new Date(novidade.publicadaEm))
              : t('novidades.naoPublicada')}
          </dd>
        </div>
        <div>
          <dt className="inline">{t('novidades.validade')}: </dt>
          <dd className="inline">
            {novidade.validade ? dia(novidade.validade) : t('novidades.semValidade')}
          </dd>
        </div>
        <div>
          <dt className="inline">{t('novidades.push')}: </dt>
          <dd className="inline">
            {!novidade.enviarPush
              ? t('novidades.semPush')
              : novidade.pushEnviadoEm
                ? t('novidades.pushEnviado', {
                    quando: FORMATO_DATA.format(new Date(novidade.pushEnviadoEm)),
                  })
                : t('novidades.pushPendente')}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-end gap-2">
        {podePublicar ? (
          <>
            <Button
              disabled={salvando}
              onClick={() =>
                void executar(
                  () => publicarAdminNovidades(novidade.id, { publicarEm: null }),
                  t('novidades.publicada'),
                )
              }
            >
              {t('novidades.publicarAgora')}
            </Button>
            <form className="flex items-end gap-2" onSubmit={aoAgendar}>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`agendar-${novidade.id}`}>{t('novidades.agendarPara')}</Label>
                <Input
                  id={`agendar-${novidade.id}`}
                  type="datetime-local"
                  className="w-56"
                  value={quando}
                  onChange={(evento) => {
                    definirAviso(null);
                    definirQuando(evento.target.value);
                  }}
                />
              </div>
              <Button type="submit" variant="outline" disabled={salvando}>
                {t('novidades.agendar')}
              </Button>
            </form>
          </>
        ) : null}
        {podeEditar ? (
          <Button
            variant="outline"
            onClick={() => {
              aoEditar(novidade);
            }}
          >
            {t('novidades.editar')}
          </Button>
        ) : null}
        {novidade.situacao !== 'desativada' ? (
          <Button
            variant="outline"
            disabled={salvando}
            onClick={() =>
              void executar(
                () => desativarAdminNovidades(novidade.id),
                t('novidades.desativadaAviso'),
              )
            }
          >
            {t('novidades.desativar')}
          </Button>
        ) : null}
      </div>
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
    </article>
  );
}
