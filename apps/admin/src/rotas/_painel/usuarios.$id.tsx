import {
  bloquearAdminUsuarios,
  ErroApi,
  estenderTesteAdminUsuarios,
  getUsuarioAdminUsuariosQueryKey,
  reativarAdminUsuarios,
  useUsuarioAdminUsuarios,
} from '@mony/api-client';
import { DIAS_EXTENSAO_TESTE_MAXIMO, type UsuarioAdmin } from '@mony/shared/admin';
import { formatarCentavos } from '@mony/shared/dinheiro';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORMATO_DATA } from '@/lib/formatos';

export const Route = createFileRoute('/_painel/usuarios/$id')({ component: Usuario });

const data = (valor: string | null, vazio: string) =>
  valor ? FORMATO_DATA.format(new Date(valor)) : vazio;

/**
 * A conta de uma pessoa (T-141a, doc 13): dados, plano, aparelhos, sessões e conexões, com bloquear,
 * reativar e estender o teste. Abrir a página grava a visualização na auditoria.
 */
function Usuario() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  // Cada leitura grava uma visualização na auditoria: não relê sozinho (foco da janela, etc.).
  const consulta = useUsuarioAdminUsuarios(id, { query: { staleTime: Infinity } });
  return (
    <div className="flex flex-col gap-6">
      <Link to="/usuarios" className="text-sm text-muted-foreground hover:underline">
        {t('usuarios.voltar')}
      </Link>
      {consulta.data ? (
        <Conta usuario={consulta.data} />
      ) : consulta.isError ? (
        <p role="alert" className="text-destructive">
          {consulta.error instanceof ErroApi && consulta.error.status === 404
            ? t('usuarios.naoEncontrado')
            : t('usuarios.erroCarregar')}
        </p>
      ) : (
        <p className="text-muted-foreground">{t('usuarios.carregando')}</p>
      )}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Conta({ usuario }: { usuario: UsuarioAdmin }) {
  const { t } = useTranslation();
  const nenhum = t('usuarios.nenhumDado');
  const assinatura = usuario.assinatura;
  const pago = usuario.plano === 'mensal' || usuario.plano === 'anual';
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{usuario.nome}</h1>
        <p className="text-muted-foreground">{usuario.email}</p>
      </div>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>
            <h2>{t('usuarios.conta')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo={t('usuarios.status')}>{t(`usuarios.situacoes.${usuario.status}`)}</Campo>
            <Campo rotulo={t('usuarios.plano')}>{t(`usuarios.planos.${usuario.plano}`)}</Campo>
            <Campo rotulo={t('usuarios.telefone')}>{usuario.telefone ?? nenhum}</Campo>
            <Campo rotulo={t('usuarios.criadoEm')}>{data(usuario.criadoEm, nenhum)}</Campo>
            <Campo rotulo={t('usuarios.ultimoAcesso')}>{data(usuario.ultimoAcesso, nenhum)}</Campo>
            <Campo rotulo={t('usuarios.fuso')}>{usuario.fusoHorario}</Campo>
            {usuario.plano === 'teste' ? (
              <Campo rotulo={t('usuarios.testeAte')}>
                {data(assinatura?.testeFim ?? null, nenhum)}
              </Campo>
            ) : null}
            {pago && assinatura ? (
              <>
                <Campo rotulo={t('usuarios.valor')}>
                  {assinatura.valorCentavos === null
                    ? nenhum
                    : formatarCentavos(assinatura.valorCentavos)}
                </Campo>
                <Campo rotulo={t('usuarios.cobranca')}>
                  {t(`usuarios.cobrancas.${assinatura.status}`)}
                  {assinatura.cancelamentoAgendado
                    ? ` · ${t('usuarios.cancelamentoAgendado')}`
                    : ''}
                </Campo>
                <Campo rotulo={t('usuarios.proximaCobranca')}>
                  {data(assinatura.proximaCobranca, nenhum)}
                </Campo>
              </>
            ) : null}
            <Campo rotulo={t('usuarios.sessoesAtivas')}>{usuario.sessoesAtivas}</Campo>
            <Campo rotulo={t('usuarios.loginsSociais')}>
              {usuario.loginsSociais.length > 0
                ? usuario.loginsSociais
                    .map((provedor) => t(`usuarios.provedores.${provedor}`))
                    .join(', ')
                : nenhum}
            </Campo>
          </dl>
          <Acoes usuario={usuario} />
        </CardContent>
      </Card>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>
            <h2>{t('usuarios.aparelhos')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usuario.aparelhos.length === 0 ? (
            <p className="text-muted-foreground">{nenhum}</p>
          ) : (
            <table aria-label={t('usuarios.aparelhos')} className="w-full text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">{t('usuarios.plataforma')}</th>
                  <th className="py-2 font-medium">{t('usuarios.modelo')}</th>
                  <th className="py-2 font-medium">{t('usuarios.ultimoUso')}</th>
                  <th className="py-2 font-medium">{t('usuarios.push')}</th>
                </tr>
              </thead>
              <tbody>
                {usuario.aparelhos.map((aparelho) => (
                  <tr key={aparelho.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {t(`usuarios.plataformas.${aparelho.plataforma}`)}
                    </td>
                    <td className="py-2 pr-4">{aparelho.modelo ?? nenhum}</td>
                    <td className="py-2 pr-4">{data(aparelho.ultimoUso, nenhum)}</td>
                    <td className="py-2">
                      {aparelho.ativo ? t('usuarios.pushAtivo') : t('usuarios.pushInativo')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {/* O Open Finance saiu do lançamento (T-158): o cartão só aparece quando houver conexão. */}
      {usuario.conexoes.length > 0 ? (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>
              <h2>{t('usuarios.conexoes')}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {usuario.conexoes.map((conexao) => (
                <li key={conexao.id}>
                  {conexao.instituicao} · {t(`usuarios.statusConexao.${conexao.status}`)} ·{' '}
                  {data(conexao.criadoEm, nenhum)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function Acoes({ usuario }: { usuario: UsuarioAdmin }) {
  const { t } = useTranslation();
  const clienteConsultas = useQueryClient();
  const [confirmando, definirConfirmando] = useState(false);
  const [dias, definirDias] = useState('');
  const [aviso, definirAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, definirSalvando] = useState(false);
  const pago = usuario.plano === 'mensal' || usuario.plano === 'anual';

  const executar = async (acao: () => Promise<UsuarioAdmin>, sucesso: string) => {
    definirSalvando(true);
    try {
      const atualizado = await acao();
      clienteConsultas.setQueryData(getUsuarioAdminUsuariosQueryKey(usuario.id), atualizado);
      definirAviso({ tipo: 'ok', texto: sucesso });
      definirConfirmando(false);
      return true;
    } catch (falha) {
      definirAviso({
        tipo: 'erro',
        texto:
          falha instanceof ErroApi && falha.codigo === 'CONFLITO'
            ? falha.message
            : t('usuarios.erroSalvar'),
      });
      return false;
    } finally {
      definirSalvando(false);
    }
  };

  const aoEstender = async (evento: SyntheticEvent) => {
    evento.preventDefault();
    const numero = Number(dias);
    if (!/^\d+$/.test(dias) || numero < 1 || numero > DIAS_EXTENSAO_TESTE_MAXIMO) {
      definirAviso({
        tipo: 'erro',
        texto: t('usuarios.diasInvalidos', { maximo: DIAS_EXTENSAO_TESTE_MAXIMO }),
      });
      return;
    }
    if (
      await executar(
        () => estenderTesteAdminUsuarios(usuario.id, { dias: numero }),
        t('usuarios.testeEstendido', { dias: numero }),
      )
    ) {
      definirDias('');
    }
  };

  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {usuario.status === 'bloqueado' ? (
          <Button
            variant="outline"
            disabled={salvando}
            onClick={() =>
              void executar(() => reativarAdminUsuarios(usuario.id), t('usuarios.reativado'))
            }
          >
            {t('usuarios.reativar')}
          </Button>
        ) : usuario.status === 'ativo' && usuario.papel !== 'admin' ? (
          confirmando ? (
            <>
              <span className="text-sm">{t('usuarios.confirmarBloqueio')}</span>
              <Button
                variant="destructive"
                disabled={salvando}
                onClick={() =>
                  void executar(() => bloquearAdminUsuarios(usuario.id), t('usuarios.bloqueado'))
                }
              >
                {t('usuarios.bloquear')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  definirConfirmando(false);
                }}
              >
                {t('usuarios.cancelar')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                definirAviso(null);
                definirConfirmando(true);
              }}
            >
              {t('usuarios.bloquear')}
            </Button>
          )
        ) : null}
      </div>
      {!pago && usuario.status !== 'excluido' ? (
        <form className="flex items-end gap-2" onSubmit={(evento) => void aoEstender(evento)}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dias-teste">{t('usuarios.estenderDias')}</Label>
            <Input
              id="dias-teste"
              className="w-28"
              inputMode="numeric"
              value={dias}
              onChange={(evento) => {
                definirAviso(null);
                definirDias(evento.target.value);
              }}
            />
          </div>
          <Button type="submit" variant="outline" disabled={salvando}>
            {t('usuarios.estender')}
          </Button>
        </form>
      ) : null}
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
  );
}
