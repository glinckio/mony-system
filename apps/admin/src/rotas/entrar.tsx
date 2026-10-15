import {
  conferir2faAdminAutenticacao,
  entrarAdminAutenticacao,
  ErroApi,
  novo2faAdminAutenticacao,
} from '@mony/api-client';
import type { Novo2fa } from '@mony/shared/admin';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { QRCodeSVG } from 'qrcode.react';
import { type SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { guardarSessaoAdmin, sessaoAdmin } from '@/lib/sessao';

/** Só caminhos do próprio painel (`/usuarios`), para o `voltar` não levar a outro site. */
function caminhoInterno(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.startsWith('/') && !valor.startsWith('//')
    ? valor
    : undefined;
}

export const Route = createFileRoute('/entrar')({
  validateSearch: (busca: Record<string, unknown>): { voltar?: string } => {
    const voltar = caminhoInterno(busca.voltar);
    return voltar ? { voltar } : {};
  },
  beforeLoad: () => {
    if (sessaoAdmin()) throw redirect({ to: '/' });
  },
  component: Entrar,
});

/** `credenciais`: e-mail e senha; `codigo`: os 6 dígitos (com o QR Code no primeiro acesso). */
type Etapa = { nome: 'credenciais' } | { nome: 'codigo'; desafio: string; novo2fa?: Novo2fa };

const cabecalhoDesafio = (desafio: string) => ({ headers: { authorization: `Bearer ${desafio}` } });

/**
 * Login do painel (T-104a, docs/arquitetura/11 e 13): e-mail e senha de um admin e o código do
 * aplicativo autenticador. No primeiro acesso, mostra o QR Code (e o segredo para digitar) antes
 * do código.
 */
function Entrar() {
  const { t } = useTranslation();
  const router = useRouter();
  const { voltar } = Route.useSearch();
  const [etapa, definirEtapa] = useState<Etapa>({ nome: 'credenciais' });
  const [email, definirEmail] = useState('');
  const [senha, definirSenha] = useState('');
  const [codigo, definirCodigo] = useState('');
  const [erro, definirErro] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);

  function mensagemDe(falha: unknown): string {
    if (!(falha instanceof ErroApi)) return t('entrar.erros.semConexao');
    switch (falha.codigo) {
      case 'CREDENCIAIS_INVALIDAS':
        return t('entrar.erros.credenciais');
      case 'CODIGO_INVALIDO':
        return t('entrar.erros.codigo');
      case 'MUITAS_TENTATIVAS':
        return t('entrar.erros.muitasTentativas');
      case 'SESSAO_INVALIDA':
        return t('entrar.erros.desafioVencido');
      default:
        return t('entrar.erros.inesperado');
    }
  }

  async function enviar(acao: () => Promise<void>) {
    definirErro(null);
    definirEnviando(true);
    try {
      await acao();
    } catch (falha) {
      definirErro(mensagemDe(falha));
      // O desafio venceu (5 minutos) ou foi usado: recomeça pelo e-mail e senha.
      if (falha instanceof ErroApi && falha.codigo === 'SESSAO_INVALIDA') {
        definirCodigo('');
        definirEtapa({ nome: 'credenciais' });
      }
    } finally {
      definirEnviando(false);
    }
  }

  const aoEntrar = (evento: SyntheticEvent) => {
    evento.preventDefault();
    void enviar(async () => {
      const resposta = await entrarAdminAutenticacao({ email, senha });
      const novo2fa = resposta.configurar2fa
        ? await novo2faAdminAutenticacao(cabecalhoDesafio(resposta.desafio))
        : undefined;
      definirSenha('');
      definirEtapa({ nome: 'codigo', desafio: resposta.desafio, ...(novo2fa ? { novo2fa } : {}) });
    });
  };

  const aoConferir = (evento: SyntheticEvent) => {
    evento.preventDefault();
    if (etapa.nome !== 'codigo') return;
    void enviar(async () => {
      const sessao = await conferir2faAdminAutenticacao(
        { codigo },
        cabecalhoDesafio(etapa.desafio),
      );
      guardarSessaoAdmin(sessao);
      await router.navigate({ to: voltar ?? '/' });
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl">{t('comum.produto')}</h1>
          </CardTitle>
          <CardDescription>
            {etapa.nome === 'credenciais'
              ? t('entrar.descricao')
              : etapa.novo2fa
                ? t('entrar.configurar.descricao')
                : t('entrar.codigo.descricao')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {etapa.nome === 'credenciais' ? (
            <form className="flex flex-col gap-4" onSubmit={aoEntrar}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t('entrar.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(evento) => {
                    definirEmail(evento.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="senha">{t('entrar.senha')}</Label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={senha}
                  onChange={(evento) => {
                    definirSenha(evento.target.value);
                  }}
                />
              </div>
              {erro ? <Aviso texto={erro} /> : null}
              <Button type="submit" disabled={enviando}>
                {t('entrar.continuar')}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={aoConferir}>
              {etapa.novo2fa ? (
                <div className="flex flex-col items-center gap-3">
                  <QRCodeSVG
                    value={etapa.novo2fa.endereco}
                    size={176}
                    marginSize={2}
                    title={t('entrar.configurar.qrCode')}
                  />
                  <p className="text-center text-sm text-muted-foreground">
                    {t('entrar.configurar.semCamera')}
                  </p>
                  <code className="rounded bg-muted px-2 py-1 text-xs break-all select-all">
                    {etapa.novo2fa.segredo}
                  </code>
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="codigo">{t('entrar.codigo.rotulo')}</Label>
                <Input
                  id="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={codigo}
                  onChange={(evento) => {
                    definirCodigo(evento.target.value.replace(/\D/g, ''));
                  }}
                />
              </div>
              {erro ? <Aviso texto={erro} /> : null}
              <Button type="submit" disabled={enviando || codigo.length !== 6}>
                {t('entrar.entrar')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  definirErro(null);
                  definirCodigo('');
                  definirEtapa({ nome: 'credenciais' });
                }}
              >
                {t('entrar.voltar')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {texto}
    </p>
  );
}
