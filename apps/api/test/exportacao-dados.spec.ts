/** Exportação dos dados do usuário (T-140a, RN-160): as tabelas que entram e o arquivo gerado. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { emailExportacaoDados } from '../src/integracoes/email/modelos/exportacao-dados';
import { gerarArquivoDados } from '../src/modulos/lgpd/arquivo-dados';
import {
  TABELAS_EXPORTADAS,
  TABELAS_FORA_DA_EXPORTACAO,
} from '../src/modulos/lgpd/dados-do-usuario';

/** As tabelas do schema com `usuarioId` (ou a própria `usuarios`), pelo `@@map`. */
function tabelasDoUsuario(): string[] {
  const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const tabelas: string[] = [];
  for (const [, nome, corpo] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const mapa = /@@map\("(\w+)"\)/.exec(corpo ?? '')?.[1];
    if (mapa === undefined) throw new Error(`model ${nome ?? '?'} sem @@map`);
    if (nome === 'Usuario' || /^\s+usuarioId\s/m.test(corpo ?? '')) tabelas.push(mapa);
  }
  return tabelas;
}

describe('exportação dos dados (RN-160)', () => {
  it('RN-160 toda tabela com dados da pessoa entra na exportação ou tem o motivo de ficar fora', () => {
    const exportadas = Object.keys(TABELAS_EXPORTADAS);
    const fora = Object.keys(TABELAS_FORA_DA_EXPORTACAO);
    const doUsuario = tabelasDoUsuario();
    expect(
      doUsuario.filter((tabela) => !exportadas.includes(tabela) && !fora.includes(tabela)),
    ).toEqual([]);
    expect([...exportadas, ...fora].filter((tabela) => !doUsuario.includes(tabela))).toEqual([]);
    expect(exportadas.filter((tabela) => fora.includes(tabela))).toEqual([]);
  });

  it('RN-160 o ZIP tem o JSON com todas as tabelas e a planilha com uma aba por tabela com linhas', () => {
    const zip = gerarArquivoDados(
      {
        usuarios: [{ id: 'u1', nome: 'Ana Souza', criadoEm: new Date('2026-10-16T12:00:00Z') }],
        transacoes: [
          { id: 't1', valor: 15_000n, descricao: 'Mercado', pago: true, extra: { a: 1 } },
          { id: 't2', valor: 2_550n, descricao: null, pago: false, extra: null },
        ],
        metas: [],
      },
      {
        nome: 'Ana Souza',
        email: 'ana@exemplo.test',
        geradoEm: '2026-10-16T12:00:00.000Z',
        geradoEmLocal: '16/10/2026 às 09:00',
      },
    );
    const arquivos = unzipSync(zip);
    expect(Object.keys(arquivos).sort()).toEqual(['meus-dados.json', 'meus-dados.xlsx']);

    const json = JSON.parse(strFromU8(arquivos['meus-dados.json'] ?? new Uint8Array())) as {
      geradoEm: string;
      tabelas: Record<string, Record<string, unknown>[]>;
    };
    expect(json.geradoEm).toBe('2026-10-16T12:00:00.000Z');
    expect(json.tabelas.metas).toEqual([]);
    // Dinheiro em centavos, como número.
    expect(json.tabelas.transacoes?.[0]).toMatchObject({ valor: 15_000, extra: { a: 1 } });
    expect(json.tabelas.usuarios?.[0]?.criadoEm).toBe('2026-10-16T12:00:00.000Z');

    const planilha = unzipSync(arquivos['meus-dados.xlsx'] ?? new Uint8Array());
    const livro = strFromU8(planilha['xl/workbook.xml'] ?? new Uint8Array());
    expect(livro).toContain('name="usuarios"');
    expect(livro).toContain('name="transacoes"');
    expect(livro).not.toContain('name="metas"');
    const transacoes = strFromU8(planilha['xl/worksheets/sheet2.xml'] ?? new Uint8Array());
    expect(transacoes).toContain('Ana Souza · ana@exemplo.test');
    expect(transacoes).toContain('Gerado em 16/10/2026 às 09:00');
    // Coluna de números fica número; sim e não no lugar de true e false; JSON do banco em texto.
    expect(transacoes).toContain('<c r="B6" s="0"><v>15000</v></c>');
    expect(transacoes).toContain('<t xml:space="preserve">sim</t>');
    expect(transacoes).toContain('<t xml:space="preserve">{&quot;a&quot;:1}</t>');
  });

  it('RN-160 o e-mail leva o link e diz por quanto tempo ele vale', () => {
    const email = emailExportacaoDados({
      nome: 'Ana Souza',
      email: 'ana@exemplo.test',
      url: 'https://arquivos.teste/x?a=1&b=2',
      validadeHoras: 24,
    });
    expect(email).toMatchObject({
      para: { email: 'ana@exemplo.test', nome: 'Ana Souza' },
      assunto: 'Seus dados do Monitorizze estão prontos',
      modelo: 'exportacao-dados',
    });
    expect(email.texto).toContain('Olá, Ana!');
    expect(email.texto).toContain('Baixar: https://arquivos.teste/x?a=1&b=2');
    expect(email.texto).toContain('O link vale por 24 horas.');
    expect(email.html).toContain('href="https://arquivos.teste/x?a=1&amp;b=2"');
  });
});
