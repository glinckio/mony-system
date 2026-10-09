import lint from '@commitlint/lint';
import load from '@commitlint/load';
import { describe, expect, it } from 'vitest';

import config from '../commitlint.js';

const carregado = await load(config);

async function valida(mensagem: string) {
  return lint(mensagem, carregado.rules, {
    plugins: carregado.plugins,
    ...(carregado.parserPreset?.parserOpts
      ? { parserOpts: carregado.parserPreset.parserOpts }
      : {}),
  });
}

describe('commitlint do Mony', () => {
  it.each([
    'feat(T-031): calcula fatura pela data de fechamento [RN-031, RN-032]',
    'chore(T-002): inicia tarefa',
    'fix(T-031a): corrige arredondamento da parcela',
    'fix(T-HOTFIX): corrige build da main',
    'feat(cartoes): calcula fatura pela data de fechamento [RN-031]',
    'docs(preferencias-alerta): explica horário de silêncio',
  ])('aceita %j', async (mensagem) => {
    const resultado = await valida(mensagem);
    expect(resultado.errors).toEqual([]);
    expect(resultado.valid).toBe(true);
  });

  it.each([
    ['sem tipo', 'atualiza coisas', 'type-empty'],
    ['sem escopo', 'feat: calcula fatura', 'scope-empty'],
    ['tipo fora da lista', 'wip(T-031): calcula fatura', 'type-enum'],
    ['tipo em maiúsculas', 'Feat(T-031): calcula fatura', 'type-case'],
    ['ID de tarefa em minúsculas', 'feat(t-031): calcula fatura', 'escopo-mony'],
    ['escopo fora do padrão', 'feat(Cartoes_Credito): calcula fatura', 'escopo-mony'],
    ['assunto vazio', 'feat(T-031): ', 'subject-empty'],
    ['assunto começando com maiúscula', 'feat(T-031): Calcula fatura', 'subject-case'],
    ['cabeçalho longo demais', `feat(T-031): ${'a'.repeat(100)}`, 'header-max-length'],
  ])('recusa commit %s', async (_caso, mensagem, regra) => {
    const resultado = await valida(mensagem);
    expect(resultado.valid).toBe(false);
    expect(resultado.errors.map((erro) => erro.name)).toContain(regra);
  });
});
