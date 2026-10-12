/**
 * @jest-environment node
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';
import type { Config } from 'tailwindcss';
import resolveConfig from 'tailwindcss/resolveConfig';
import ts from 'typescript';

/* eslint-disable @typescript-eslint/no-require-imports -- APIs internas do Tailwind 3.4 (versão fixa no package.json) e a configuração em CommonJS */
const { createContext } = require('tailwindcss/lib/lib/setupContextUtils') as {
  createContext: (config: unknown) => unknown;
};
const { generateRules } = require('tailwindcss/lib/lib/generateRules') as {
  generateRules: (candidatos: Set<string>, contexto: unknown) => unknown[];
};
const configuracaoDoApp = require('../tailwind.config.js') as Config;
/* eslint-enable @typescript-eslint/no-require-imports */

const RAIZ = path.resolve(__dirname, '..');
const PASTAS = ['app', 'src'];

function arquivosDoApp(pasta: string): string[] {
  return fs.readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = path.join(pasta, item.name);
    if (item.isDirectory()) return arquivosDoApp(caminho);
    return /\.tsx?$/.test(item.name) && !item.name.endsWith('.d.ts') ? [caminho] : [];
  });
}

/** Cada palavra de cada texto do código (literais e partes fixas de template), com o arquivo. */
function palavrasDoCodigo(): Map<string, Set<string>> {
  const palavras = new Map<string, Set<string>>();
  for (const arquivo of PASTAS.flatMap((pasta) => arquivosDoApp(path.join(RAIZ, pasta)))) {
    const fonte = ts.createSourceFile(
      arquivo,
      fs.readFileSync(arquivo, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visitar = (no: ts.Node) => {
      if (
        ts.isStringLiteral(no) ||
        ts.isNoSubstitutionTemplateLiteral(no) ||
        ts.isTemplateHead(no) ||
        ts.isTemplateMiddle(no) ||
        ts.isTemplateTail(no)
      ) {
        for (const palavra of no.text.split(/\s+/)) {
          if (!/^!?-?[a-z][\w:./[\]%#()-]*$/.test(palavra)) continue;
          const onde = palavras.get(palavra) ?? new Set<string>();
          onde.add(path.relative(RAIZ, arquivo));
          palavras.set(palavra, onde);
        }
      }
      ts.forEachChild(no, visitar);
    };
    visitar(fonte);
  }
  return palavras;
}

/** Diz se a classe gera CSS com a configuração. */
function gerador(config: Config): (classe: string) => boolean {
  const contexto = createContext(resolveConfig({ ...config, content: [{ raw: '' }] }));
  return (classe) => generateRules(new Set([classe]), contexto).length > 0;
}

describe('classes do Tailwind (doc 04, design system)', () => {
  const doApp = gerador(configuracaoDoApp);
  // O Tailwind de fábrica, com o mesmo preset: o que existe nele e não no tema do app é um valor
  // fora dos tokens. Palavras que não são classe em nenhum dos dois (texto comum) ficam de fora.
  const deFabrica = gerador({
    content: [],
    ...(configuracaoDoApp.presets ? { presets: configuracaoDoApp.presets } : {}),
  });

  it('nenhuma classe usa valor fora dos tokens (ex.: h-14, w-px), que some sem aviso', () => {
    const foraDosTokens = [...palavrasDoCodigo()]
      .filter(([classe]) => deFabrica(classe) && !doApp(classe))
      .map(([classe, arquivos]) => `${classe} (${[...arquivos].join(', ')})`)
      .sort();
    expect(foraDosTokens).toEqual([]);
  });

  it('o teste pega classe fora dos tokens e aceita as dos tokens', () => {
    for (const classe of ['h-14', 'w-px', 'text-red-500']) {
      expect(deFabrica(classe)).toBe(true);
    }
    expect(deFabrica('Mercado')).toBe(false);
    expect(doApp('h-14')).toBe(false);
    expect(doApp('w-px')).toBe(false);
    expect(doApp('text-red-500')).toBe(false);
    expect(doApp('gap-3')).toBe(true);
    expect(doApp('bg-superficie')).toBe(true);
    expect(doApp('active:opacity-70')).toBe(true);
    expect(doApp('min-h-toque')).toBe(true);
  });
});
