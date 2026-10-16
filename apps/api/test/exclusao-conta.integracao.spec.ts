/**
 * Excluir a conta (T-140b, RN-161) com Postgres e Redis de verdade (`TESTES_INTEGRACAO=1`): o
 * pedido com senha ou código, a desistência, e a exclusão definitiva (rotina e job chamados
 * direto), com a cobrança falsa, o S3 em memória e as filas falsas.
 */
import { createHash, randomInt, randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import type { ExclusaoConta } from '@mony/shared/usuario';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import {
  ArmazenamentoArquivos,
  ArmazenamentoMemoria,
} from '../src/core/arquivos/armazenamento-arquivos';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import { CobrancaFake } from '../src/integracoes/cobranca/cobranca-fake';
import { CobrancaProvider } from '../src/integracoes/cobranca/cobranca.provider';
import type { MensagemEmail } from '../src/integracoes/email/email.provider';
import { ExclusaoContaService } from '../src/modulos/lgpd/exclusao-conta.service';
import { emailDoControle } from '../src/modulos/planos/dominio/teste';
import { criarFilaFalsa } from './utilitarios';

const ativo = process.env.TESTES_INTEGRACAO === '1';

describe.runIf(ativo)('integração: excluir a conta', () => {
  let app: NestFastifyApplication;
  let cobranca: CobrancaFake;
  const relogio = new ClockFixo('2026-10-16T15:00:00Z');
  const armazenamento = new ArmazenamentoMemoria();
  const fila = criarFilaFalsa();
  const filaEmails = criarFilaFalsa();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(relogio)
      .overrideProvider(ArmazenamentoArquivos)
      .useValue(armazenamento)
      .overrideProvider(getQueueToken(FILAS.privacidade))
      .useValue(fila)
      .overrideProvider(getQueueToken(FILAS.emails))
      .useValue(filaEmails)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    cobranca = app.get<CobrancaFake>(CobrancaProvider);
  });

  beforeEach(() => {
    fila.add.mockClear();
    filaEmails.add.mockClear();
    relogio.definir(new Date('2026-10-16T15:00:00Z'));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const ipQualquer = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const aparelho = () => ({ identificador: `aparelho-${randomUUID()}`, plataforma: 'ios' });

  function cadastrar(email: string) {
    return app.inject({
      method: 'POST',
      url: '/v1/auth/cadastro',
      remoteAddress: ipQualquer(),
      payload: {
        nome: 'Ana Souza',
        email,
        telefone: '(11) 98765-4321',
        senha: 'segredo123',
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: aparelho(),
      },
    });
  }

  type Sessao = { usuario: { id: string }; tokens: { acesso: string; renovacao: string } };

  async function usuarioNovo() {
    const email = `teste-${randomUUID()}@exemplo.test`;
    const resposta = await cadastrar(email);
    expect(resposta.statusCode).toBe(201);
    const sessao = resposta.json<Sessao>();
    return {
      usuarioId: sessao.usuario.id,
      acesso: sessao.tokens.acesso,
      renovacao: sessao.tokens.renovacao,
      email,
    };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    usuario: Usuario,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      remoteAddress: ipQualquer(),
      headers: { authorization: `Bearer ${usuario.acesso}`, 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  /** Uma assinatura mensal ativa na cobrança falsa e no banco. */
  async function assinar(usuario: Usuario): Promise<string> {
    const id = `sub_fake_${randomUUID()}`;
    const clienteId = `cus_fake_${randomUUID()}`;
    cobranca.assinaturas.set(id, {
      id,
      clienteId,
      situacao: 'ativa',
      precoId: null,
      intervalo: 'mes',
      valorCentavos: 1_990,
      inicio: new Date('2026-10-01T00:00:00Z'),
      fimDoPeriodo: new Date('2026-11-01T00:00:00Z'),
      cancelamentoAgendado: false,
      canceladaEm: null,
    });
    await prisma.assinatura.update({
      where: { usuarioId: usuario.usuarioId },
      data: {
        plano: 'mensal',
        status: 'ativa',
        stripeCustomerId: clienteId,
        stripeSubscriptionId: id,
        proximaCobranca: new Date('2026-11-01T00:00:00Z'),
      },
    });
    return id;
  }

  function emailsDoModelo(modelo: string): MensagemEmail[] {
    return filaEmails.add.mock.calls
      .map(([, email]) => email as MensagemEmail)
      .filter((email) => email.modelo === modelo);
  }

  const exclusao = () => app.get(ExclusaoContaService);

  it('RN-161 com a senha agenda para 7 dias e encerra as sessões; entrar de novo e desistir desfaz tudo', async () => {
    const ana = await usuarioNovo();
    const assinaturaId = await assinar(ana);
    expect((await chamar(ana, 'GET', '/me/exclusao')).json()).toEqual({ agendadaPara: null });

    const errada = await chamar(ana, 'POST', '/me/exclusao', { senha: 'outra-senha' });
    expect(errada.statusCode).toBe(400);
    expect(errada.json()).toMatchObject({ erro: { codigo: 'SENHA_INCORRETA' } });
    expect((await chamar(ana, 'POST', '/me/exclusao', {})).statusCode).toBe(400);

    const pedido = await chamar(ana, 'POST', '/me/exclusao', { senha: 'segredo123' });
    expect(pedido.statusCode).toBe(200);
    expect(pedido.json<ExclusaoConta>()).toEqual({ agendadaPara: '2026-10-23T15:00:00.000Z' });
    // A renovação da assinatura não acontece durante o prazo.
    expect(cobranca.assinaturas.get(assinaturaId)?.cancelamentoAgendado).toBe(true);
    const [agendada] = emailsDoModelo('exclusao-agendada');
    expect(agendada).toMatchObject({ para: { email: ana.email } });
    expect(agendada?.assunto).toContain('23/10/2026');
    // As sessões foram encerradas: a renovação do token não vale mais.
    const renovar = await app.inject({
      method: 'POST',
      url: '/v1/auth/renovar',
      payload: { renovacao: ana.renovacao },
    });
    expect(renovar.statusCode).toBe(401);

    // Dentro do prazo, entra de novo, vê a data e desiste.
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      remoteAddress: ipQualquer(),
      payload: { email: ana.email, senha: 'segredo123', dispositivo: aparelho() },
    });
    expect(login.statusCode).toBe(200);
    const deNovo = { ...ana, acesso: login.json<Sessao>().tokens.acesso };
    expect((await chamar(deNovo, 'GET', '/me/exclusao')).json()).toEqual({
      agendadaPara: '2026-10-23T15:00:00.000Z',
    });
    const desistiu = await chamar(deNovo, 'DELETE', '/me/exclusao');
    expect(desistiu.statusCode).toBe(200);
    expect(desistiu.json()).toEqual({ agendadaPara: null });
    expect(cobranca.assinaturas.get(assinaturaId)?.cancelamentoAgendado).toBe(false);

    // Passado o prazo, a rotina não pega quem desistiu.
    relogio.definir(new Date('2026-10-24T15:00:00Z'));
    await exclusao().agendarVencidas(relogio.agora());
    expect(fila.add.mock.calls.map(([, dados]) => dados)).not.toContainEqual({
      usuarioId: ana.usuarioId,
    });
  });

  it('RN-161 quem já tinha cancelado a assinatura continua com o cancelamento depois de desistir', async () => {
    const ana = await usuarioNovo();
    const assinaturaId = await assinar(ana);
    await prisma.assinatura.update({
      where: { usuarioId: ana.usuarioId },
      data: { cancelamentoAgendado: true },
    });
    const sub = cobranca.assinaturas.get(assinaturaId);
    if (sub) cobranca.assinaturas.set(assinaturaId, { ...sub, cancelamentoAgendado: true });

    await chamar(ana, 'POST', '/me/exclusao', { senha: 'segredo123' });
    await exclusao().desistir(ana.usuarioId);
    expect(cobranca.assinaturas.get(assinaturaId)?.cancelamentoAgendado).toBe(true);
  });

  it('RN-161 com o código por e-mail; vencido o prazo, apaga os dados e arquivos, cancela a assinatura e anonimiza a conta (RN-125 o teste não volta)', async () => {
    const ana = await usuarioNovo();
    const assinaturaId = await assinar(ana);
    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { usuarioId: ana.usuarioId, tipo: 'despesa' },
    });
    const lancamento = await chamar(ana, 'POST', '/transacoes', {
      tipo: 'despesa',
      descricao: 'Mercado',
      valorCentavos: 15_000,
      data: '2026-10-10',
      categoriaId: categoria.id,
      formaPagamento: 'pix',
    });
    expect(lancamento.statusCode).toBe(201);
    const cartao = await chamar(ana, 'POST', '/cartoes', {
      nome: 'Nubank',
      limiteTotalCentavos: 100_000,
      diaFechamento: 3,
      diaVencimento: 10,
      cor: '#820AD1',
    });
    expect(cartao.statusCode).toBe(201);
    const parcelada = await chamar(ana, 'POST', '/parcelamentos', {
      tipo: 'compra_cartao',
      nome: 'Geladeira',
      valorCentavos: 30_000,
      totalParcelas: 3,
      categoriaId: categoria.id,
      cartaoId: cartao.json<{ id: string }>().id,
    });
    expect(parcelada.statusCode).toBe(201);
    const chaveAnexo = `usuarios/${ana.usuarioId}/anexos/${randomUUID()}.jpg`;
    await armazenamento.gravar(chaveAnexo, new Uint8Array([1, 2, 3]), 'image/jpeg');
    await prisma.anexo.create({
      data: {
        usuarioId: ana.usuarioId,
        tipo: 'foto',
        arquivoUrl: chaveAnexo,
        tamanho: 3,
      },
    });

    // Sem senha: o código vai por e-mail e não serve para trocar a senha.
    expect((await chamar(ana, 'POST', '/me/exclusao/codigo')).statusCode).toBe(204);
    const [comCodigo] = emailsDoModelo('codigo-exclusao-conta');
    const codigo = /\b(\d{6})\b/.exec(comCodigo?.texto ?? '')?.[1] ?? '';
    expect(codigo).toMatch(/^\d{6}$/);
    const conferir = await app.inject({
      method: 'POST',
      url: '/v1/auth/senha/conferir',
      remoteAddress: ipQualquer(),
      payload: { email: ana.email, codigo },
    });
    expect(conferir.statusCode).toBe(400);
    const errado = codigo === '000000' ? '111111' : '000000';
    expect((await chamar(ana, 'POST', '/me/exclusao', { codigo: errado })).statusCode).toBe(400);
    const pedido = await chamar(ana, 'POST', '/me/exclusao', { codigo });
    expect(pedido.statusCode).toBe(200);
    // O código foi gasto.
    expect((await chamar(ana, 'POST', '/me/exclusao', { codigo })).json()).toMatchObject({
      erro: { codigo: 'CODIGO_EXPIRADO' },
    });

    // No 6º dia ainda não; no 7º, a rotina põe na fila.
    relogio.definir(new Date('2026-10-22T15:00:00Z'));
    await exclusao().agendarVencidas(relogio.agora());
    expect(fila.add).not.toHaveBeenCalledWith(
      'excluir-conta',
      { usuarioId: ana.usuarioId },
      expect.anything(),
    );
    relogio.definir(new Date('2026-10-23T15:20:00Z'));
    await exclusao().agendarVencidas(relogio.agora());
    expect(fila.add).toHaveBeenCalledWith(
      'excluir-conta',
      { usuarioId: ana.usuarioId },
      expect.objectContaining({ attempts: 5 }),
    );

    await exclusao().excluir(ana.usuarioId);

    expect(cobranca.assinaturas.get(assinaturaId)?.situacao).toBe('encerrada');
    expect(armazenamento.objetos.has(chaveAnexo)).toBe(false);
    const conta = await prisma.usuario.findUniqueOrThrow({ where: { id: ana.usuarioId } });
    expect(conta).toMatchObject({
      status: 'excluido',
      nome: 'Conta excluída',
      email: `excluida-${ana.usuarioId}@excluida.invalid`,
      telefone: null,
      senhaHash: null,
    });
    const onde = { where: { usuarioId: ana.usuarioId } };
    expect(await prisma.transacao.count(onde)).toBe(0);
    expect(await prisma.parcelamento.count(onde)).toBe(0);
    expect(await prisma.cartao.count(onde)).toBe(0);
    expect(await prisma.categoria.count(onde)).toBe(0);
    expect(await prisma.anexo.count(onde)).toBe(0);
    expect(await prisma.sessao.count(onde)).toBe(0);
    expect(await prisma.dispositivo.count(onde)).toBe(0);
    // Ficam: a assinatura (histórico de cobrança) e os aceites dos termos.
    expect(await prisma.assinatura.count(onde)).toBe(1);
    expect(await prisma.aceiteTermos.count(onde)).toBeGreaterThan(0);
    const [confirmacao] = emailsDoModelo('conta-excluida');
    expect(confirmacao).toMatchObject({ para: { email: ana.email } });

    // De novo não faz nada.
    await exclusao().excluir(ana.usuarioId);
    expect(emailsDoModelo('conta-excluida')).toHaveLength(1);

    // O e-mail fica livre para uma conta nova, mas sem outro teste grátis (RN-125).
    const hash = createHash('sha256').update(emailDoControle(ana.email)).digest('hex');
    expect(await prisma.controleTeste.count({ where: { tipo: 'email', valorHash: hash } })).toBe(1);
    const volta = await cadastrar(ana.email);
    expect(volta.statusCode).toBe(201);
    const nova = await prisma.assinatura.findUniqueOrThrow({
      where: { usuarioId: volta.json<Sessao>().usuario.id },
    });
    expect(nova.plano).toBe('gratuito');
  });
});
