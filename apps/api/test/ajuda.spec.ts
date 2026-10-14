/**
 * Ajuda do app (T-086a, doc 08, `ajuda_app`): a busca na base versionada. A ferramenta da Mony está
 * em `mony.integracao.spec.ts`.
 */
import { describe, expect, it } from 'vitest';

import { AjudaService, palavrasDaPergunta } from '../src/modulos/ajuda/ajuda.service';
import { BASE_AJUDA } from '../src/modulos/ajuda/base-ajuda';

const ajuda = new AjudaService();
const primeiro = (pergunta: string) => ajuda.buscar(pergunta).topicos[0]?.titulo ?? null;

describe('ajuda do app (T-086a)', () => {
  it('as palavras da pergunta, sem acento e sem as que não dizem o assunto', () => {
    expect(palavrasDaPergunta('Como eu faço para exportar o relatório em PDF?')).toEqual([
      'exportar',
      'relatorio',
      'pdf',
    ]);
  });

  it('acha o tópico pela palavra, também com outra forma dela', () => {
    expect(primeiro('como eu exporto o relatório?')).toBe(
      'Relatórios, exportação e histórico de preços',
    );
    expect(primeiro('dá pra parcelar uma compra?')).toBe('Compras parceladas');
    expect(primeiro('como escondo os valores da tela?')).toBe(
      'Esconder os valores (modo privacidade)',
    );
    expect(primeiro('como leio o QR do cupom fiscal?')).toBe('Ler cupom fiscal, foto ou PDF');
    expect(primeiro('quero colocar um alarme')).toBe('Lembretes e alarmes');
    expect(primeiro('como desligo as notificações de noite?')).toBe(
      'Alertas da Mony e horário de silêncio',
    );
    expect(primeiro('quanto custa o plano pago?')).toBe('Plano gratuito, teste grátis e limites');
  });

  it('no máximo 3 tópicos, e nenhum quando a pergunta não é sobre o app', () => {
    expect(ajuda.buscar('limite').topicos.length).toBeLessThanOrEqual(3);
    expect(ajuda.buscar('qual a previsão do tempo amanhã?').topicos).toEqual([]);
  });

  it('a base: ids únicos, palavras sem acento e em minúsculas, texto em markdown', () => {
    expect(new Set(BASE_AJUDA.map(({ id }) => id)).size).toBe(BASE_AJUDA.length);
    for (const topico of BASE_AJUDA) {
      for (const palavra of topico.palavras) expect(palavra).toMatch(/^[a-z0-9]+$/);
      expect(topico.texto.startsWith('- ')).toBe(true);
    }
  });
});
