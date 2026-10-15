import { describe, expect, it } from 'vitest';

import { esquemaListaMudou, esquemaSalaLista, salaDaLista, salaDoUsuario } from './tempo-real.js';

describe('tempo real das listas (T-124b)', () => {
  const id = '0199a000-0000-7000-8000-000000000001';

  it('RN-074 o aviso só diz qual lista mudou e por quê', () => {
    expect(esquemaListaMudou.safeParse({ listaId: id, motivo: 'itens' }).success).toBe(true);
    expect(esquemaListaMudou.safeParse({ listaId: id, motivo: 'outro' }).success).toBe(false);
    expect(esquemaSalaLista.safeParse({ listaId: 'abc' }).success).toBe(false);
  });

  it('salas da lista e do usuário não se confundem', () => {
    expect(salaDaLista(id)).not.toBe(salaDoUsuario(id));
  });
});
