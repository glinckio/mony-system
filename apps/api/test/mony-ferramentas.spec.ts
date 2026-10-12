import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ErroDominio } from '../src/core/erros/erro-dominio';
import {
  type ContextoFerramenta,
  type Ferramenta,
  RegistroFerramentas,
} from '../src/modulos/mony/ferramentas/registro';
import { conversaParaModelo } from '../src/modulos/mony/historico';
import type { MensagemSalva } from '../src/modulos/mony/mony.repository';

const contexto: ContextoFerramenta = { usuarioId: 'u1', origem: 'mony', conversaId: 'c1' };

function ferramenta(executar: Ferramenta['executar']): Ferramenta {
  return {
    nome: 'somar',
    descricao: 'Soma dois números.',
    esquema: z.object({ a: z.number().int(), b: z.number().int().default(0) }),
    executar,
  };
}

describe('RegistroFerramentas', () => {
  it('mostra ao modelo o JSON Schema da entrada, sem o $schema', () => {
    const registro = new RegistroFerramentas([ferramenta(() => Promise.resolve({ dados: null }))]);
    expect(registro.paraModelo()).toEqual([
      {
        nome: 'somar',
        descricao: 'Soma dois números.',
        esquemaEntrada: {
          type: 'object',
          properties: {
            a: {
              type: 'integer',
              minimum: Number.MIN_SAFE_INTEGER,
              maximum: Number.MAX_SAFE_INTEGER,
            },
            b: {
              type: 'integer',
              minimum: Number.MIN_SAFE_INTEGER,
              maximum: Number.MAX_SAFE_INTEGER,
              default: 0,
            },
          },
          required: ['a'],
        },
      },
    ]);
    expect(
      () =>
        new RegistroFerramentas([
          ferramenta(() => Promise.resolve({ dados: null })),
          ferramenta(() => Promise.resolve({ dados: null })),
        ]),
    ).toThrow(/repetida/);
  });

  it('RN-092 valida a entrada e executa com o contexto da conversa, não com o do modelo', async () => {
    const executar = vi.fn<Ferramenta['executar']>(() =>
      Promise.resolve({
        dados: { total: 5 },
        componentes: [{ tipo: 'botoes', opcoes: [{ id: 'a', rotulo: 'A', acao: {} }] }],
      }),
    );
    const registro = new RegistroFerramentas([ferramenta(executar)]);

    expect(
      await registro.executar(contexto, {
        id: 't1',
        nome: 'somar',
        entrada: { a: 5, usuarioId: 'outro' },
      }),
    ).toEqual({
      conteudo: '{"total":5}',
      erro: false,
      componentes: [{ tipo: 'botoes', opcoes: [{ id: 'a', rotulo: 'A', acao: {} }] }],
    });
    expect(executar).toHaveBeenCalledWith(contexto, { a: 5, b: 0 });

    const invalida = await registro.executar(contexto, { id: 't2', nome: 'somar', entrada: {} });
    expect(invalida.erro).toBe(true);
    expect(JSON.parse(invalida.conteudo)).toMatchObject({
      erro: { codigo: 'REQUISICAO_INVALIDA' },
    });
    expect(executar).toHaveBeenCalledTimes(1);

    expect(
      await registro.executar(contexto, { id: 't3', nome: 'apagar_tudo', entrada: {} }),
    ).toEqual({
      conteudo: '{"erro":"A ferramenta apagar_tudo não existe."}',
      erro: true,
      componentes: [],
    });
  });

  it('RN-087 erro de regra e falha inesperada voltam ao modelo como falha', async () => {
    const deRegra = new RegistroFerramentas([
      ferramenta(() => Promise.reject(new ErroDominio('NAO_ENCONTRADO'))),
    ]);
    expect(await deRegra.executar(contexto, { id: 't', nome: 'somar', entrada: { a: 1 } })).toEqual(
      {
        conteudo: JSON.stringify({
          erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontramos o que você procurou.' },
        }),
        erro: true,
        componentes: [],
      },
    );

    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const quebrada = new RegistroFerramentas([
      ferramenta(() => Promise.reject(new Error('conexão com o banco caiu'))),
    ]);
    const resultado = await quebrada.executar(contexto, {
      id: 't',
      nome: 'somar',
      entrada: { a: 1 },
    });
    expect(resultado).toEqual({
      conteudo: JSON.stringify({ erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha interna.' } }),
      erro: true,
      componentes: [],
    });
    // O detalhe interno fica no log, não vai ao modelo.
    expect(resultado.conteudo).not.toContain('banco');
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('conexão com o banco caiu'),
      expect.any(String),
    );
    log.mockRestore();
  });
});

describe('conversaParaModelo', () => {
  let segundos = 0;
  function mensagem(
    autor: MensagemSalva['autor'],
    conteudo: string | null,
    extras: Partial<MensagemSalva> = {},
  ): MensagemSalva {
    segundos += 1;
    return {
      id: `m${String(segundos)}`,
      autor,
      tipo: 'texto',
      conteudo,
      componentes: null,
      criadoEm: new Date(Date.UTC(2026, 9, 15, 12, 0, segundos)),
      ...extras,
    };
  }

  it('do mais antigo para a atual, com botões oferecidos e tocados, e turnos do mesmo papel juntos', () => {
    // Do banco, da mais nova para a mais antiga.
    const anteriores = [
      mensagem('usuario', 'e agora?'),
      mensagem('mony', 'Pronto! Anotei R$ 10,00 em Mercado, no Pix.'),
      mensagem('usuario', 'Pix', { tipo: 'botao' }),
      mensagem('mony', 'Como você pagou?', {
        componentes: [
          {
            tipo: 'botoes',
            opcoes: [
              { id: 'pix', rotulo: 'Pix', acao: {} },
              { id: 'debito', rotulo: 'Débito', acao: {} },
            ],
          },
        ],
      }),
      mensagem('usuario', 'gastei 10 no mercado'),
      mensagem('mony', 'Oi! Eu sou a Mony.'),
    ];

    expect(conversaParaModelo(anteriores, 'quanto gastei?', 10_000)).toEqual([
      // A conversa começa pelo usuário: a saudação da Mony antes de tudo fica de fora.
      { papel: 'usuario', conteudo: 'gastei 10 no mercado' },
      { papel: 'assistente', conteudo: 'Como você pagou?\n[botões: Pix | Débito]' },
      { papel: 'usuario', conteudo: '(tocou em "Pix")' },
      { papel: 'assistente', conteudo: 'Pronto! Anotei R$ 10,00 em Mercado, no Pix.' },
      // A mensagem anterior sem resposta e a atual viram um turno só.
      { papel: 'usuario', conteudo: 'e agora?\n\nquanto gastei?' },
    ]);
  });

  it('para no teto de tamanho, pulando mensagens vazias', () => {
    const anteriores = [
      mensagem('mony', 'b'.repeat(40)),
      mensagem('usuario', null),
      mensagem('usuario', 'a'.repeat(40)),
    ];
    expect(conversaParaModelo(anteriores, 'oi', 60)).toEqual([
      { papel: 'usuario', conteudo: 'oi' },
    ]);
    expect(conversaParaModelo(anteriores, 'oi', 100)).toEqual([
      { papel: 'usuario', conteudo: 'a'.repeat(40) },
      { papel: 'assistente', conteudo: 'b'.repeat(40) },
      { papel: 'usuario', conteudo: 'oi' },
    ]);
  });
});
