import { Link } from '@tanstack/react-router';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { BlocoDocumento, DocumentoLegal } from './documento';

/** `**texto**` em negrito; o resto como veio. */
function comNegrito(texto: string): ReactNode {
  return texto.split('**').map((trecho, indice) =>
    indice % 2 === 1 ? (
      <strong key={indice} className="font-semibold">
        {trecho}
      </strong>
    ) : (
      <Fragment key={indice}>{trecho}</Fragment>
    ),
  );
}

function Bloco({ bloco }: { bloco: BlocoDocumento }) {
  switch (bloco.tipo) {
    case 'paragrafo':
      return <p className="leading-relaxed">{comNegrito(bloco.texto)}</p>;
    case 'lista':
      return (
        <ul className="flex list-disc flex-col gap-1 pl-6 leading-relaxed">
          {bloco.itens.map((item) => (
            <li key={item}>{comNegrito(item)}</li>
          ))}
        </ul>
      );
    case 'tabela':
      return (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted">
              <tr>
                {bloco.cabecalho.map((coluna) => (
                  <th key={coluna} scope="col" className="px-3 py-2 text-left font-semibold">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloco.linhas.map((linha) => (
                <tr key={linha.join('|')} className="border-t align-top">
                  {linha.map((celula, indice) => (
                    <td key={indice} className="px-3 py-2">
                      {comNegrito(celula)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * Página pública de um documento legal (T-140g): fora do painel, sem login, para o app, as lojas e
 * o Google apontarem para ela.
 */
export function PaginaDocumento({ documento }: { documento: DocumentoLegal }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <nav
          aria-label={t('legal.documentos')}
          className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4"
        >
          <span className="mr-auto font-semibold">{t('legal.produto')}</span>
          <Link
            to="/termos"
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: 'font-medium text-foreground' }}
          >
            {t('legal.termos')}
          </Link>
          <Link
            to="/privacidade"
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: 'font-medium text-foreground' }}
          >
            {t('legal.privacidade')}
          </Link>
          <Link
            to="/excluir-conta"
            className="text-sm text-muted-foreground hover:text-foreground"
            activeProps={{ className: 'font-medium text-foreground' }}
          >
            {t('legal.excluirConta')}
          </Link>
        </nav>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold">{documento.titulo}</h1>
          {documento.versao === undefined ? null : (
            <p className="text-sm text-muted-foreground">
              {t('legal.versao', { versao: documento.versao })}
            </p>
          )}
        </div>
        {documento.secoes.map((secao) => (
          <section key={secao.titulo} className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{secao.titulo}</h2>
            {secao.blocos.map((bloco, indice) => (
              <Bloco key={indice} bloco={bloco} />
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
