import path from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { criarConfigEslint } from '../eslint.js';

const pastaExemplos = path.join(import.meta.dirname, 'fixtures');

const eslint = new ESLint({
  cwd: pastaExemplos,
  overrideConfigFile: true,
  overrideConfig: criarConfigEslint({ tsconfigRootDir: pastaExemplos }),
});

async function regrasVioladas(arquivo: string) {
  const [resultado] = await eslint.lintFiles([path.join(pastaExemplos, arquivo)]);
  if (!resultado) throw new Error(`ESLint não devolveu resultado para ${arquivo}`);
  return resultado.messages.map((mensagem) => mensagem.ruleId ?? mensagem.message);
}

describe('config do ESLint', () => {
  it('aceita código no padrão, inclusive any com justificativa', async () => {
    expect(await regrasVioladas('valido.ts')).toEqual([]);
  });

  it('proíbe any', async () => {
    expect(await regrasVioladas('any.ts')).toEqual(['@typescript-eslint/no-explicit-any']);
  });

  it('exige justificativa ao desligar uma regra', async () => {
    expect(await regrasVioladas('desliga-sem-motivo.ts')).toEqual([
      '@eslint-community/eslint-comments/require-description',
    ]);
  });

  it('recusa número com casas decimais em campo de centavos', async () => {
    expect(await regrasVioladas('centavos-decimal.ts')).toEqual([
      'no-restricted-syntax',
      'no-restricted-syntax',
      'no-restricted-syntax',
    ]);
  });

  it('roda as regras que dependem de tipo', async () => {
    expect(await regrasVioladas('promessa-solta.ts')).toEqual([
      '@typescript-eslint/no-floating-promises',
    ]);
  });
});
