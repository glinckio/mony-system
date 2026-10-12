import { describe, expect, it } from 'vitest';

import { CONTEUDOS_DO_TIPO, esquemaNovoArquivo, TIPOS_CONTEUDO_ANEXO } from './arquivos.js';
import { TIPOS_ANEXO } from './enums.js';

describe('arquivo novo', () => {
  it('o tipo de conteúdo combina com o tipo: foto, PDF, comprovante e áudio (T-064)', () => {
    const valido = (tipo: string, tipoConteudo: string) =>
      esquemaNovoArquivo.safeParse({ tipo, tipoConteudo, tamanho: 1024 }).success;
    expect(valido('foto', 'image/jpeg')).toBe(true);
    expect(valido('pdf', 'application/pdf')).toBe(true);
    expect(valido('comprovante', 'application/pdf')).toBe(true);
    expect(valido('comprovante', 'image/heic')).toBe(true);
    expect(valido('audio', 'audio/mp4')).toBe(true);
    expect(valido('audio', 'audio/webm')).toBe(true);
    expect(valido('audio', 'image/jpeg')).toBe(false);
    expect(valido('foto', 'audio/mp4')).toBe(false);
    expect(valido('comprovante', 'audio/mpeg')).toBe(false);
    expect(valido('audio', 'video/mp4')).toBe(false);
  });

  it('todo tipo tem conteúdo, e todo conteúdo serve a algum tipo', () => {
    for (const tipo of TIPOS_ANEXO) expect(CONTEUDOS_DO_TIPO[tipo].length).toBeGreaterThan(0);
    const usados = new Set(Object.values(CONTEUDOS_DO_TIPO).flat());
    expect([...TIPOS_CONTEUDO_ANEXO].filter((conteudo) => !usados.has(conteudo))).toEqual([]);
  });
});
