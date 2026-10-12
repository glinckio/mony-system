import { describe, expect, it } from 'vitest';

import {
  esquemaAcaoMony,
  esquemaMensagemMony,
  type EventoMony,
  eventoMonyDoSse,
  formatarEventoSse,
  LeitorSse,
} from './mony.js';

describe('SSE da Mony', () => {
  const eventos: EventoMony[] = [
    { tipo: 'texto.delta', texto: 'Anotei R$ 10,00.\nEm qual categoria?' },
    {
      tipo: 'componente',
      componente: {
        tipo: 'botoes',
        opcoes: [{ id: 'mercado', rotulo: 'Mercado', acao: { etapa: 'categoria' } }],
      },
    },
    { tipo: 'fim', mensagemId: '0199a000-0000-7000-8000-000000000001' },
  ];

  it('formata e lê de volta, mesmo com o corpo cortado em qualquer ponto', () => {
    const corpo = eventos.map(formatarEventoSse).join('');
    for (let tamanho = 1; tamanho <= corpo.length; tamanho += 1) {
      const leitor = new LeitorSse();
      const lidos = [];
      for (let inicio = 0; inicio < corpo.length; inicio += tamanho) {
        lidos.push(...leitor.ler(corpo.slice(inicio, inicio + tamanho)));
      }
      expect(lidos.map(eventoMonyDoSse)).toEqual(eventos);
      expect(lidos.map(({ evento }) => evento)).toEqual(['texto.delta', 'componente', 'fim']);
    }
  });

  it('aceita \\r\\n e \\r, ignora comentário e junta várias linhas de data', () => {
    const leitor = new LeitorSse();
    const corpo = ': ping\r\nevent: a\r\ndata: um\r\ndata: dois\r\n\r\ndata: tres\r\r\n';
    const lidos = [...leitor.ler(corpo.slice(0, 20)), ...leitor.ler(corpo.slice(20))];
    expect(lidos).toEqual([
      { evento: 'a', dados: 'um\ndois' },
      { evento: 'message', dados: 'tres' },
    ]);
  });

  it('\\r no fim de um pedaço e \\n no começo do outro são um fim de linha só', () => {
    const leitor = new LeitorSse();
    expect(leitor.ler('data: x\r')).toEqual([]);
    expect(leitor.ler('\ndata: y\r\n\r\n')).toEqual([{ evento: 'message', dados: 'x\ny' }]);
  });

  it('evento sem linha em branco no fim é descartado', () => {
    const leitor = new LeitorSse();
    expect(leitor.ler('data: incompleto')).toEqual([]);
    leitor.terminar();
    expect(leitor.ler('\n\n')).toEqual([]);
  });

  it('evento desconhecido ou JSON quebrado vira null', () => {
    expect(eventoMonyDoSse({ evento: 'novo', dados: '{"tipo":"novo"}' })).toBeNull();
    expect(eventoMonyDoSse({ evento: 'fim', dados: '{quebrado' })).toBeNull();
  });
});

describe('ação do botão (RN-084)', () => {
  const id = '0199a000-0000-7000-8000-000000000001';

  it('responde o rascunho, desfaz, confirma exclusão ou cancela; o servidor confere o resto', () => {
    const rascunho = { tipo: 'rascunho', rascunhoId: id, valor: 'pix' };
    expect(esquemaAcaoMony.safeParse({ ...rascunho, campo: 'forma_pagamento' }).success).toBe(true);
    expect(esquemaAcaoMony.safeParse({ ...rascunho, campo: 'valor' }).success).toBe(false);
    expect(esquemaAcaoMony.safeParse({ ...rascunho, campo: 'cartao', valor: '' }).success).toBe(
      false,
    );
    expect(esquemaAcaoMony.safeParse({ tipo: 'desfazer', alvo: 'transacao', id }).success).toBe(
      true,
    );
    expect(esquemaAcaoMony.safeParse({ tipo: 'desfazer', alvo: 'meta', id }).success).toBe(false);
    expect(esquemaAcaoMony.safeParse({ tipo: 'excluir_transacao', transacaoId: id }).success).toBe(
      true,
    );
    expect(
      esquemaAcaoMony.safeParse({ tipo: 'pagar_fatura', faturaId: id, valorCentavos: 12_000 })
        .success,
    ).toBe(true);
    expect(
      esquemaAcaoMony.safeParse({ tipo: 'pagar_fatura', faturaId: id, valorCentavos: 0 }).success,
    ).toBe(false);
    expect(esquemaAcaoMony.safeParse({ tipo: 'cancelar' }).success).toBe(true);
    // Sem tipo (formato da T-061) ou com o estado no botão (PoC) não vale mais.
    expect(
      esquemaAcaoMony.safeParse({ rascunhoId: id, campo: 'categoria', valor: id }).success,
    ).toBe(false);
  });
});

describe('mensagem para a Mony (T-064)', () => {
  const arquivoId = '0199a000-0000-7000-8000-000000000002';

  it('o texto ou o áudio já enviado, um dos dois', () => {
    expect(esquemaMensagemMony.parse({ texto: '  gastei 10  ' })).toEqual({ texto: 'gastei 10' });
    expect(esquemaMensagemMony.parse({ arquivoId })).toEqual({ arquivoId });
    expect(esquemaMensagemMony.safeParse({}).success).toBe(false);
    expect(esquemaMensagemMony.safeParse({ texto: 'oi', arquivoId }).success).toBe(false);
    expect(esquemaMensagemMony.safeParse({ texto: '   ' }).success).toBe(false);
    expect(esquemaMensagemMony.safeParse({ arquivoId: 'audio.m4a' }).success).toBe(false);
  });

  it('o evento da transcrição chega pelo SSE', () => {
    const evento: EventoMony = { tipo: 'transcricao', texto: 'gastei 10 no mercado' };
    const [bruto] = new LeitorSse().ler(formatarEventoSse(evento));
    expect(bruto && eventoMonyDoSse(bruto)).toEqual(evento);
  });
});
