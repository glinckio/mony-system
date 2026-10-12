import { describe, expect, it } from '@jest/globals';

import { tamanhoParaTexto } from './tamanho';

describe('tamanho do anexo', () => {
  it('em KB até 1 MB e em MB com vírgula depois', () => {
    expect(tamanhoParaTexto(120)).toBe('1 KB');
    expect(tamanhoParaTexto(300_000)).toBe('293 KB');
    expect(tamanhoParaTexto(1_258_291)).toBe('1,2 MB');
    expect(tamanhoParaTexto(10 * 1024 * 1024)).toBe('10,0 MB');
  });
});
