/**
 * Exclusão da conta (T-140b, RN-161): as tabelas apagadas e mantidas, a rotina e os e-mails; e a
 * retenção dos arquivos (T-140c, RN-162).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { esquemaRetencao, RETENCAO_ARQUIVOS_DIAS_PADRAO } from '@mony/shared/admin';
import { esquemaPedidoExclusaoConta } from '@mony/shared/usuario';
import { describe, expect, it } from 'vitest';

import { ROTINA } from '../src/core/rotinas/rotinas';
import {
  emailCodigoExclusaoConta,
  emailContaExcluida,
  emailExclusaoAgendada,
} from '../src/integracoes/email/modelos/exclusao-conta';
import {
  TABELAS_APAGADAS,
  TABELAS_MANTIDAS_NA_EXCLUSAO,
} from '../src/modulos/lgpd/exclusao-conta.repository';
import { ExclusaoContaService } from '../src/modulos/lgpd/exclusao-conta.service';
import { RetencaoArquivosService } from '../src/modulos/lgpd/retencao-arquivos.service';

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

describe('exclusão da conta (RN-161)', () => {
  it('RN-161 toda tabela com dados da pessoa é apagada ou tem o motivo de ficar', () => {
    const apagadas = Object.keys(TABELAS_APAGADAS);
    const mantidas = Object.keys(TABELAS_MANTIDAS_NA_EXCLUSAO);
    const doUsuario = tabelasDoUsuario();
    expect(
      doUsuario.filter((tabela) => !apagadas.includes(tabela) && !mantidas.includes(tabela)),
    ).toEqual([]);
    expect([...apagadas, ...mantidas].filter((tabela) => !doUsuario.includes(tabela))).toEqual([]);
    expect(apagadas.filter((tabela) => mantidas.includes(tabela))).toEqual([]);
  });

  it('RN-161 os lançamentos saem antes das categorias, cartões, faturas e parcelamentos que prendem', () => {
    const ordem = Object.keys(TABELAS_APAGADAS);
    const antes = (a: string, b: string) => ordem.indexOf(a) < ordem.indexOf(b);
    for (const preso of ['categorias', 'cartoes', 'faturas', 'parcelamentos']) {
      expect(antes('transacoes', preso)).toBe(true);
    }
    expect(antes('recorrencias', 'categorias')).toBe(true);
    expect(antes('parcelamentos', 'categorias')).toBe(true);
    expect(antes('parcelamentos', 'cartoes')).toBe(true);
  });

  it('RN-161 confirma com a senha ou com o código, nunca os dois nem nenhum', () => {
    expect(esquemaPedidoExclusaoConta.safeParse({ senha: 'segredo123' }).success).toBe(true);
    expect(esquemaPedidoExclusaoConta.safeParse({ codigo: '004217' }).success).toBe(true);
    expect(esquemaPedidoExclusaoConta.safeParse({}).success).toBe(false);
    expect(
      esquemaPedidoExclusaoConta.safeParse({ senha: 'segredo123', codigo: '004217' }).success,
    ).toBe(false);
    expect(esquemaPedidoExclusaoConta.safeParse({ codigo: '12345' }).success).toBe(false);
  });

  it('RN-161 as exclusões vencidas vão para a fila de hora em hora, no minuto 20', () => {
    const metodo = Reflect.get(ExclusaoContaService.prototype, 'agendarVencidas') as object;
    expect(Reflect.getMetadata(ROTINA, metodo)).toEqual({
      nome: 'excluir-contas',
      padrao: '20 * * * *',
    });
  });

  it('RN-161 os e-mails: o código, o aviso com a data e como desistir, e a confirmação', () => {
    const para = { nome: 'Ana <b>Souza</b>', email: 'ana@exemplo.test' };
    const codigo = emailCodigoExclusaoConta({ ...para, codigo: '004217', validadeMinutos: 15 });
    expect(codigo.modelo).toBe('codigo-exclusao-conta');
    expect(codigo.texto).toContain('004217');
    expect(codigo.texto.indexOf('004217')).toBeLessThan(codigo.texto.indexOf('15 minutos'));
    expect(codigo.html).not.toContain('<b>');

    const agendada = emailExclusaoAgendada({ ...para, dataExclusao: '23/10/2026' });
    expect(agendada.assunto).toContain('23/10/2026');
    expect(agendada.texto).toContain('Desistir da exclusão');
    expect(agendada.para).toEqual({ email: 'ana@exemplo.test', nome: 'Ana <b>Souza</b>' });

    expect(emailContaExcluida(para).modelo).toBe('conta-excluida');
  });
});

describe('retenção de fotos e áudios (RN-162)', () => {
  it('RN-162 a limpeza dos arquivos roda todo dia às 03:30', () => {
    const metodo = Reflect.get(RetencaoArquivosService.prototype, 'limpar') as object;
    expect(Reflect.getMetadata(ROTINA, metodo)).toEqual({
      nome: 'limpar-arquivos',
      padrao: '30 3 * * *',
    });
  });

  it('RN-162 o prazo padrão é 90 dias, de 30 a 3650 no painel', () => {
    expect(RETENCAO_ARQUIVOS_DIAS_PADRAO).toBe(90);
    expect(esquemaRetencao.safeParse({ diasArquivos: 29 }).success).toBe(false);
    expect(esquemaRetencao.safeParse({ diasArquivos: 180 }).success).toBe(true);
  });
});
