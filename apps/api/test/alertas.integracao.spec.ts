/**
 * Avaliadores de alertas com Postgres e Redis de verdade (job Banco do CI, `TESTES_INTEGRACAO=1`).
 * Os lançamentos são feitos pela API com o relógio parado em 15/10/2026 (meio-dia em São Paulo);
 * os avaliadores são chamados direto, com o evento ou o instante que o teste escolhe. O canal de
 * envio é trocado por um que só anota.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { formatarCentavos } from '@mony/shared/dinheiro';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { contextoDoSistema } from '../src/core/contexto/contexto';
import type { EventoDominio } from '../src/core/eventos/evento-dominio';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { AlertasModule } from '../src/modulos/alertas/alertas.module';
import { AvaliadoresAlertas } from '../src/modulos/alertas/avaliadores-alertas';
import {
  type EnvioDeNotificacoes,
  EnvioNotificacoes,
} from '../src/modulos/notificacoes/envio-notificacoes';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** 15/10/2026, meio-dia em São Paulo (quinta-feira, semana ISO 42). */
const AGORA = new Date('2026-10-15T15:00:00Z');
/** 09:05 em São Paulo, a hora da rotina diária. */
const noDia = (data: string) => new Date(`${data}T12:05:00Z`);

class EnvioAnotado extends EnvioNotificacoes {
  readonly envios: EnvioDeNotificacoes[] = [];

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.envios.push(envio);
    return Promise.resolve();
  }
}

const reais = (centavos: number) => formatarCentavos(centavos);

describe.runIf(ativo)('integração: avaliadores de alertas', () => {
  let app: NestFastifyApplication;
  let avaliadores: AvaliadoresAlertas;
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule, AlertasModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(AGORA))
      .overrideProvider(EnvioNotificacoes)
      .useValue(new EnvioAnotado())
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    avaliadores = app.get(AvaliadoresAlertas);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function usuarioNovo() {
    const resposta = await app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
      payload: {
        nome: 'Ana Souza',
        email: `teste-${randomUUID()}@exemplo.test`,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: { identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' },
      },
    });
    const sessao = resposta.json<{ usuario: { id: string }; tokens: { acesso: string } }>();
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: sessao.usuario.id, tipo: 'despesa' },
      orderBy: { nome: 'asc' },
    });
    return {
      usuarioId: sessao.usuario.id,
      acesso: sessao.tokens.acesso,
      despesa: categoria.id,
      nomeDespesa: categoria.nome,
    };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  async function chamar(
    method: 'POST' | 'PUT' | 'PATCH',
    usuario: Usuario,
    url: string,
    dados: Record<string, unknown>,
  ) {
    const resposta = await app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      payload: dados,
    });
    expect(resposta.statusCode, resposta.body).toBeLessThan(300);
    return resposta;
  }

  async function postar<T>(usuario: Usuario, url: string, dados: Record<string, unknown>) {
    return (await chamar('POST', usuario, url, dados)).json<T>();
  }

  async function despesa(usuario: Usuario, dados: Record<string, unknown>) {
    const { transacao } = await postar<{ transacao: { id: string; faturaId: string | null } }>(
      usuario,
      '/transacoes',
      {
        tipo: 'despesa',
        descricao: 'Compra',
        categoriaId: usuario.despesa,
        formaPagamento: 'pix',
        data: '2026-10-15',
        ...dados,
      },
    );
    return transacao;
  }

  async function cartaoNovo(usuario: Usuario, diaFechamento: number, diaVencimento: number) {
    const { id } = await postar<{ id: string }>(usuario, '/cartoes', {
      nome: 'Nubank',
      limiteTotalCentavos: 100_000,
      diaFechamento,
      diaVencimento,
      cor: '#820AD1',
    });
    return id;
  }

  function evento<Dados>(nome: string, dados: Dados): EventoDominio<Dados> {
    return { nome, dados, ocorridoEm: AGORA.toISOString(), contexto: contextoDoSistema() };
  }

  async function registrada(id: string) {
    await avaliadores.aoRegistrarTransacao(evento('transacao.registrada', { transacaoId: id }));
  }

  function notificacoes(usuario: Usuario) {
    return prisma.notificacao.findMany({
      where: { usuarioId: usuario.usuarioId },
      select: {
        tipo: true,
        chaveUnica: true,
        titulo: true,
        corpo: true,
        linkInterno: true,
        enviadaEm: true,
      },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async function chaves(usuario: Usuario): Promise<string[]> {
    return (await notificacoes(usuario)).map(({ chaveUnica }) => chaveUnica);
  }

  it('RN-038 limite do cartão: a maior faixa atingida, uma vez por ciclo da fatura', async () => {
    const usuario = await usuarioNovo();
    // Fecha dia 5: em 15/10 o ciclo aberto é o da fatura de novembro.
    const cartaoId = await cartaoNovo(usuario, 5, 12);
    const noCartao = { formaPagamento: 'cartao_credito', cartaoId };

    await registrada((await despesa(usuario, { ...noCartao, valorCentavos: 85_000 })).id);
    expect(await notificacoes(usuario)).toEqual([
      {
        tipo: 'limite_cartao',
        chaveUnica: `limite:${cartaoId}:2026-11:80`,
        titulo: 'Nubank: 80% do limite usado',
        corpo: `Você já usou ${reais(85_000)} de ${reais(100_000)} do limite do cartão.`,
        linkInterno: `mony://cartoes/${cartaoId}`,
        enviadaEm: AGORA,
      },
    ]);

    // 95%: a faixa de 80% já foi avisada neste ciclo.
    await registrada((await despesa(usuario, { ...noCartao, valorCentavos: 10_000 })).id);
    expect(await chaves(usuario)).toHaveLength(1);

    await registrada((await despesa(usuario, { ...noCartao, valorCentavos: 10_000 })).id);
    const [, cem] = await notificacoes(usuario);
    expect(cem).toMatchObject({
      chaveUnica: `limite:${cartaoId}:2026-11:100`,
      titulo: 'Nubank: limite atingido',
    });
  });

  it('lançamento alterado também é avaliado', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario, 5, 12);
    const compra = await despesa(usuario, {
      formaPagamento: 'cartao_credito',
      cartaoId,
      valorCentavos: 40_000,
    });
    await registrada(compra.id);
    expect(await chaves(usuario)).toEqual([]);

    await chamar('PATCH', usuario, `/transacoes/${compra.id}`, { valorCentavos: 60_000 });
    await avaliadores.aoAlterarTransacao(evento('transacao.alterada', { transacaoId: compra.id }));
    expect(await chaves(usuario)).toEqual([`limite:${cartaoId}:2026-11:50`]);
  });

  it('RN-062 orçamento: 80% e 100% no mês de hoje; lançamento de outro mês não avisa', async () => {
    const usuario = await usuarioNovo();
    await chamar('PUT', usuario, '/orcamentos', {
      categoriaId: usuario.despesa,
      valorLimiteCentavos: 50_000,
    });

    await registrada((await despesa(usuario, { valorCentavos: 40_000, data: '2026-10-10' })).id);
    expect(await notificacoes(usuario)).toEqual([
      expect.objectContaining({
        tipo: 'orcamento',
        chaveUnica: `orcamento:${usuario.despesa}:2026-10:80`,
        titulo: `${usuario.nomeDespesa}: 80% do orçamento`,
        corpo: `Você já gastou ${reais(40_000)} de ${reais(50_000)} em outubro.`,
        linkInterno: 'mony://orcamentos?competencia=2026-10',
      }),
    ]);

    await registrada((await despesa(usuario, { valorCentavos: 4_000, data: '2026-09-20' })).id);
    expect(await chaves(usuario)).toHaveLength(1);

    await registrada((await despesa(usuario, { valorCentavos: 15_000, data: '2026-10-14' })).id);
    expect((await notificacoes(usuario))[1]).toMatchObject({
      chaveUnica: `orcamento:${usuario.despesa}:2026-10:100`,
      titulo: `${usuario.nomeDespesa}: orçamento estourado`,
      corpo: `Você gastou ${reais(55_000)} de ${reais(50_000)} em outubro.`,
    });
  });

  it('RN-106 gasto fora do padrão: 3× a média de 90 dias, com 5 lançamentos e lançamento recente', async () => {
    const usuario = await usuarioNovo();
    for (const dia of ['01', '02', '03', '04']) {
      await despesa(usuario, { valorCentavos: 4_000, data: `2026-09-${dia}` });
    }
    // Com 4 lançamentos na média, ainda não avalia.
    const cedo = await despesa(usuario, { valorCentavos: 50_000, data: '2026-10-14' });
    await registrada(cedo.id);
    expect(await chaves(usuario)).toEqual([]);

    await prisma.transacao.update({ where: { id: cedo.id }, data: { valor: 4_000n } });
    // Média de 5 × R$ 40,00: R$ 110,00 não chega a 3× (R$ 120,00).
    await registrada((await despesa(usuario, { valorCentavos: 11_000 })).id);
    expect(await chaves(usuario)).toEqual([]);
    // Agora a média é de 6 lançamentos (R$ 310,00 ÷ 6 = R$ 51,67): R$ 200,00 passa de 3×.
    const fora = await despesa(usuario, { descricao: 'Restaurante', valorCentavos: 20_000 });
    await registrada(fora.id);
    expect(await notificacoes(usuario)).toEqual([
      expect.objectContaining({
        tipo: 'gasto_fora_padrao',
        chaveUnica: `fora_padrao:${fora.id}`,
        titulo: `Gasto fora do padrão em ${usuario.nomeDespesa}`,
        corpo: `Restaurante: ${reais(20_000)}, bem acima da sua média na categoria (${reais(5_167)}).`,
        linkInterno: `mony://transacoes/${fora.id}`,
      }),
    ]);

    // Lançamento de 14 dias atrás não é avaliado.
    await registrada((await despesa(usuario, { valorCentavos: 90_000, data: '2026-10-01' })).id);
    expect(await chaves(usuario)).toHaveLength(1);
  });

  it('fatura fechada e atrasada (urgente); fatura quitada não avisa', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario, 5, 12);
    const noCartao = { formaPagamento: 'cartao_credito', cartaoId };
    // Compra em 01/10, antes do fechamento de 05/10: fatura de outubro, que vence em 12/10.
    const { faturaId } = await despesa(usuario, {
      ...noCartao,
      valorCentavos: 30_000,
      data: '2026-10-01',
    });
    const fatura = { faturaId: faturaId ?? '' };

    await avaliadores.aoFecharFatura(evento('fatura.fechada', fatura));
    await avaliadores.aoFecharFatura(evento('fatura.fechada', fatura));
    await avaliadores.aoAtrasarFatura(evento('fatura.atrasada', fatura));
    expect(await notificacoes(usuario)).toEqual([
      expect.objectContaining({
        tipo: 'fatura_fechada',
        chaveUnica: `fatura_fechada:${fatura.faturaId}`,
        titulo: 'Fatura do cartão Nubank fechou',
        corpo: `${reais(30_000)} a pagar até 12/10.`,
        linkInterno: `mony://cartoes/${cartaoId}/faturas/${fatura.faturaId}`,
      }),
      expect.objectContaining({
        tipo: 'fatura_atrasada',
        chaveUnica: `fatura_atrasada:${fatura.faturaId}`,
        titulo: 'Fatura do cartão Nubank atrasada',
        corpo: `Venceu em 12/10 e faltam ${reais(30_000)}. Já pagou? Toque em Paguei.`,
      }),
    ]);

    const outra = await usuarioNovo();
    const outroCartao = await cartaoNovo(outra, 5, 12);
    const paga = await despesa(outra, {
      formaPagamento: 'cartao_credito',
      cartaoId: outroCartao,
      valorCentavos: 10_000,
      data: '2026-10-01',
    });
    await postar(outra, `/faturas/${paga.faturaId ?? ''}/pagar`, {});
    await avaliadores.aoAtrasarFatura(evento('fatura.atrasada', { faturaId: paga.faturaId ?? '' }));
    expect(await chaves(outra)).toEqual([]);
  });

  it('compra parcelada no cartão avisa a faixa do limite', async () => {
    const usuario = await usuarioNovo();
    const cartaoId = await cartaoNovo(usuario, 5, 12);
    const { parcelamento } = await postar<{ parcelamento: { id: string } }>(
      usuario,
      '/parcelamentos',
      {
        tipo: 'compra_cartao',
        nome: 'Geladeira',
        valorCentavos: 60_000,
        totalParcelas: 3,
        categoriaId: usuario.despesa,
        cartaoId,
      },
    );
    await avaliadores.aoRegistrarParcelamento(
      evento('parcelamento.registrado', { parcelamentoId: parcelamento.id }),
    );
    expect(await chaves(usuario)).toEqual([`limite:${cartaoId}:2026-11:50`]);
  });

  it('RN-108 vencimentos: X dias antes (uma vez) e no dia, com a antecedência do usuário', async () => {
    const usuario = await usuarioNovo();
    // Fecha dia 5 e vence dia 18: compra em 01/10 → fatura que vence em 18/10.
    const cartaoId = await cartaoNovo(usuario, 5, 18);
    const { faturaId } = await despesa(usuario, {
      formaPagamento: 'cartao_credito',
      cartaoId,
      valorCentavos: 12_000,
      data: '2026-10-01',
    });
    const boleto = { formaPagamento: 'boleto' };
    const luz = await despesa(usuario, {
      ...boleto,
      descricao: 'Luz',
      valorCentavos: 7_000,
      data: '2026-10-17',
    });
    await despesa(usuario, {
      ...boleto,
      descricao: 'Água',
      valorCentavos: 5_000,
      data: '2026-10-25',
    });
    await postar(usuario, '/parcelamentos', {
      tipo: 'divida',
      nome: 'Empréstimo',
      valorCentavos: 20_000,
      totalParcelas: 2,
      dataInicio: '2026-10-15',
      categoriaId: usuario.despesa,
    });
    const parcela = await prisma.parcela.findFirstOrThrow({
      where: { usuarioId: usuario.usuarioId, numero: 1 },
    });

    const candidatos = await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-15'));
    expect(candidatos.map(({ chaveUnica, titulo, corpo }) => [chaveUnica, titulo, corpo])).toEqual([
      [
        `fatura_venc:${faturaId ?? ''}:3`,
        'Fatura do cartão Nubank vence em 3 dias',
        `Faltam ${reais(12_000)} (vencimento em 18/10).`,
      ],
      [
        `venc:${parcela.id}:0`,
        'Empréstimo (1/2) vence hoje',
        `${reais(10_000)} (vencimento em 15/10).`,
      ],
      [`venc:${luz.id}:3`, 'Luz vence em 2 dias', `${reais(7_000)} (vencimento em 17/10).`],
    ]);
    expect((await notificacoes(usuario)).map(({ tipo }) => tipo)).toEqual([
      'fatura_vencimento',
      'vencimento_pendente',
      'vencimento_pendente',
    ]);

    // No dia seguinte o aviso de antes já saiu.
    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-16'));
    expect(await chaves(usuario)).toHaveLength(3);

    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-18'));
    expect(await chaves(usuario)).toContain(`fatura_venc:${faturaId ?? ''}:0`);

    // Antecedência 0: só no dia.
    await chamar('PUT', usuario, '/preferencias-alerta', {
      tipos: [{ tipo: 'vencimento_pendente', antecedenciaDias: 0 }],
    });
    const antes = await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-23'));
    expect(antes.map(({ chaveUnica }) => chaveUnica)).toEqual([]);
  });

  it('RN-107 projeção do mês negativa: uma vez por semana, só para quem tem conta', async () => {
    const usuario = await usuarioNovo();
    const { id: contaId } = await postar<{ id: string }>(usuario, '/contas', {
      nome: 'Banco',
      tipo: 'corrente',
      saldoInicialCentavos: 10_000,
    });
    await despesa(usuario, {
      formaPagamento: 'boleto',
      descricao: 'Aluguel',
      valorCentavos: 50_000,
      data: '2026-10-25',
      contaId,
    });

    const [projecao] = await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-15'));
    expect(projecao).toMatchObject({
      tipo: 'projecao_mes',
      chaveUnica: 'projecao:2026-W42',
      titulo: 'Seu mês pode fechar no vermelho',
      corpo: `Pela projeção, o saldo termina outubro em ${reais(-40_000)}. Veja onde ajustar.`,
      linkInterno: 'mony://inicio',
    });
    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-16'));
    await avaliadores.avaliarDiario(usuario.usuarioId, noDia('2026-10-19'));
    expect(await chaves(usuario)).toEqual(['projecao:2026-W42', 'projecao:2026-W43']);

    // Saldo que cobre as contas e o gasto variável dos próximos dias: sem alerta.
    const folgado = await usuarioNovo();
    const { id: contaFolgada } = await postar<{ id: string }>(folgado, '/contas', {
      nome: 'Banco',
      tipo: 'corrente',
      saldoInicialCentavos: 100_000,
    });
    await despesa(folgado, { valorCentavos: 30_000, data: '2026-10-10', contaId: contaFolgada });
    expect(await avaliadores.avaliarDiario(folgado.usuarioId, noDia('2026-10-15'))).toEqual([]);

    // Sem conta, não há saldo para projetar.
    const semConta = await usuarioNovo();
    await despesa(semConta, {
      formaPagamento: 'boleto',
      valorCentavos: 50_000,
      data: '2026-10-25',
    });
    expect(await avaliadores.avaliarDiario(semConta.usuarioId, noDia('2026-10-15'))).toEqual([]);
  });

  it('a rotina avalia quem está às 09:00 no próprio fuso', async () => {
    const usuario = await usuarioNovo();
    await prisma.usuario.update({
      where: { id: usuario.usuarioId },
      data: { fusoHorario: 'Pacific/Chatham' },
    });
    const gas = await despesa(usuario, {
      formaPagamento: 'boleto',
      descricao: 'Gás',
      valorCentavos: 9_000,
      data: '2026-10-16',
    });
    // 19:20 UTC de 15/10 = 09:05 de 16/10 em Chatham (UTC+13:45); em São Paulo são 16:20.
    const { usuarios, falhas } = await avaliadores.diarios(new Date('2026-10-15T19:20:00Z'));
    expect(usuarios).toBeGreaterThanOrEqual(1);
    expect(falhas).toBe(0);
    expect(await chaves(usuario)).toEqual([`venc:${gas.id}:0`]);
  });
});
