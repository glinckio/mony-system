/**
 * Motor de alertas e central de notificações com Postgres e Redis de verdade (job Banco do CI,
 * `TESTES_INTEGRACAO=1`). O motor é chamado direto, com candidatos do teste e o instante que o
 * teste escolhe; o canal de envio é trocado por um que só anota.
 */
import { randomInt, randomUUID } from 'node:crypto';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { configurarApp, criarAdaptadorFastify } from '../src/configurar-app';
import { Clock, ClockFixo } from '../src/core/clock/clock';
import { criarClientePrisma } from '../src/core/prisma/cliente';
import {
  type EnvioDeNotificacoes,
  EnvioNotificacoes,
} from '../src/modulos/notificacoes/envio-notificacoes';
import { type AlertaCandidato, MotorAlertas } from '../src/modulos/notificacoes/motor-alertas';

const ativo = process.env.TESTES_INTEGRACAO === '1';

/** 15/10/2026, meio-dia em São Paulo. */
const AGORA = new Date('2026-10-15T15:00:00Z');

class EnvioAnotado extends EnvioNotificacoes {
  readonly envios: EnvioDeNotificacoes[] = [];

  enviar(envio: EnvioDeNotificacoes): Promise<void> {
    this.envios.push(envio);
    return Promise.resolve();
  }

  doUsuario(usuarioId: string) {
    return this.envios.filter((envio) => envio.usuarioId === usuarioId);
  }
}

interface Notificacao {
  id: string;
  tipo: string;
  enviadaEm: string | null;
  lidaEm: string | null;
}

describe.runIf(ativo)('integração: motor de alertas e central', () => {
  let app: NestFastifyApplication;
  let motor: MotorAlertas;
  const envio = new EnvioAnotado();
  const prisma = criarClientePrisma(process.env.DATABASE_URL ?? '');

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue(new ClockFixo(AGORA))
      .overrideProvider(EnvioNotificacoes)
      .useValue(envio)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(criarAdaptadorFastify());
    configurarApp(app, { documentacao: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    motor = app.get(MotorAlertas);
  });

  beforeEach(() => {
    envio.envios.length = 0;
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
    return { usuarioId: sessao.usuario.id, acesso: sessao.tokens.acesso };
  }

  type Usuario = Awaited<ReturnType<typeof usuarioNovo>>;

  function chamar(
    method: 'GET' | 'POST' | 'PUT',
    usuario: Usuario,
    url: string,
    payload?: unknown,
  ) {
    return app.inject({
      method,
      url: `/v1${url}`,
      headers: { authorization: `Bearer ${usuario.acesso}` },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
  }

  function candidato(
    usuario: Usuario,
    chaveUnica: string,
    extra: Partial<AlertaCandidato> = {},
  ): AlertaCandidato {
    return {
      usuarioId: usuario.usuarioId,
      tipo: 'orcamento',
      chaveUnica,
      urgente: false,
      titulo: 'Mercado: 80% do orçamento',
      corpo: 'Você já usou R$ 400,00 de R$ 500,00.',
      linkInterno: 'mony://orcamentos',
      vaiParaChat: false,
      ...extra,
    };
  }

  async function central(usuario: Usuario, consulta = '') {
    const resposta = await chamar('GET', usuario, `/notificacoes${consulta}`);
    expect(resposta.statusCode, resposta.body).toBe(200);
    return resposta.json<{
      itens: Notificacao[];
      proximoCursor: string | null;
      naoLidas: number;
    }>();
  }

  it('RN-102 grava e envia uma vez por chave; link inválido não entra', async () => {
    const usuario = await usuarioNovo();
    const primeiro = await motor.emitir([candidato(usuario, 'orcamento:x:2026-10:80')], AGORA);
    expect(primeiro.enviadas).toHaveLength(1);
    expect(envio.doUsuario(usuario.usuarioId)).toEqual([
      expect.objectContaining({
        agrupada: false,
        notificacoes: [expect.objectContaining({ tipo: 'orcamento' })],
      }),
    ]);
    const repetido = await motor.emitir(
      [
        candidato(usuario, 'orcamento:x:2026-10:80'),
        candidato(usuario, 'quebrado', { linkInterno: 'https://exemplo.test' }),
      ],
      AGORA,
    );
    expect(repetido.descartadas).toEqual([
      { chaveUnica: 'orcamento:x:2026-10:80', motivo: 'repetido' },
      { chaveUnica: 'quebrado', motivo: 'link_invalido' },
    ]);
    const { itens } = await central(usuario);
    expect(itens).toEqual([expect.objectContaining({ tipo: 'orcamento', lidaEm: null })]);
    expect(itens[0]?.enviadaEm).not.toBeNull();
  });

  it('RN-100 tipo desligado não gera notificação; assinatura não desliga', async () => {
    const usuario = await usuarioNovo();
    const padrao = await chamar('GET', usuario, '/preferencias-alerta');
    expect(padrao.json()).toMatchObject({ silencio: null });
    expect(padrao.json<{ tipos: object[] }>().tipos).toEqual(
      expect.arrayContaining([
        { tipo: 'orcamento', ativo: true, antecedenciaDias: null, desligavel: true },
        { tipo: 'fatura_vencimento', ativo: true, antecedenciaDias: 3, desligavel: true },
        { tipo: 'assinatura', ativo: true, antecedenciaDias: null, desligavel: false },
      ]),
    );
    const recusado = await chamar('PUT', usuario, '/preferencias-alerta', {
      tipos: [{ tipo: 'assinatura', ativo: false }],
    });
    expect(recusado.statusCode).toBe(400);
    const desligado = await chamar('PUT', usuario, '/preferencias-alerta', {
      tipos: [
        { tipo: 'orcamento', ativo: false },
        { tipo: 'fatura_vencimento', antecedenciaDias: 5 },
      ],
    });
    expect(desligado.json<{ tipos: object[] }>().tipos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tipo: 'orcamento', ativo: false }),
        expect.objectContaining({ tipo: 'fatura_vencimento', antecedenciaDias: 5 }),
      ]),
    );
    const resultado = await motor.emitir(
      [
        candidato(usuario, 'orcamento:y:2026-10:100'),
        candidato(usuario, 'assinatura:1', {
          tipo: 'assinatura',
          urgente: true,
          linkInterno: 'mony://assinatura',
        }),
      ],
      AGORA,
    );
    expect(resultado.descartadas).toEqual([
      { chaveUnica: 'orcamento:y:2026-10:100', motivo: 'desligado' },
    ]);
    expect(resultado.enviadas).toHaveLength(1);
  });

  it('RN-103 no máximo 3 alertas de consultoria por dia do usuário', async () => {
    const usuario = await usuarioNovo();
    const consultoria = (chave: string) =>
      candidato(usuario, chave, { tipo: 'gasto_fora_padrao', linkInterno: 'mony://transacoes' });
    const resultado = await motor.emitir(
      ['a', 'b', 'c', 'd'].map((sufixo) => consultoria(`fora_padrao:${sufixo}`)),
      AGORA,
    );
    expect(resultado.enviadas).toHaveLength(3);
    expect(resultado.descartadas).toEqual([
      { chaveUnica: 'fora_padrao:d', motivo: 'cota_consultoria' },
    ]);
    // No dia seguinte do usuário (16/10 em São Paulo), a cota volta.
    const amanha = await motor.emitir(
      [consultoria('fora_padrao:e')],
      new Date('2026-10-16T13:00:00Z'),
    );
    expect(amanha.enviadas).toHaveLength(1);
  });

  it('RN-101 no silêncio o não urgente espera; no fim, mais de 3 saem agrupados', async () => {
    const usuario = await usuarioNovo();
    const silencio = await chamar('PUT', usuario, '/preferencias-alerta', {
      silencio: { inicio: '22:00', fim: '07:00' },
    });
    expect(silencio.json()).toMatchObject({ silencio: { inicio: '22:00', fim: '07:00' } });
    // 23:00 em São Paulo.
    const noite = new Date('2026-10-16T02:00:00Z');
    const resultado = await motor.emitir(
      [
        ...[1, 2, 3, 4].map((numero) => candidato(usuario, `orcamento:noite:${String(numero)}`)),
        candidato(usuario, 'fatura_atrasada:1', {
          tipo: 'fatura_atrasada',
          urgente: true,
          linkInterno: 'mony://cartoes',
        }),
      ],
      noite,
    );
    expect(resultado.adiadas).toHaveLength(4);
    expect(resultado.enviadas).toHaveLength(1);
    expect(envio.doUsuario(usuario.usuarioId)).toHaveLength(1);
    expect(
      (await central(usuario)).itens.filter(({ enviadaEm }) => enviadaEm === null),
    ).toHaveLength(4);

    // 06:00 ainda é silêncio; 07:05 já não.
    await motor.liberarSilencio(new Date('2026-10-16T09:00:00Z'));
    expect(envio.doUsuario(usuario.usuarioId)).toHaveLength(1);
    await motor.liberarSilencio(new Date('2026-10-16T10:05:00Z'));
    const envios = envio.doUsuario(usuario.usuarioId);
    expect(envios).toHaveLength(2);
    expect(envios[1]).toMatchObject({ agrupada: true });
    expect(envios[1]?.notificacoes).toHaveLength(4);
    expect((await central(usuario)).itens.every(({ enviadaEm }) => enviadaEm !== null)).toBe(true);
  });

  it('central: página por cursor, filtros, lidas e contador no Início', async () => {
    const usuario = await usuarioNovo();
    const outro = await usuarioNovo();
    await motor.emitir(
      [
        candidato(usuario, 'c:1'),
        candidato(usuario, 'c:2', { tipo: 'fatura_fechada', linkInterno: 'mony://cartoes' }),
        candidato(usuario, 'c:3'),
      ],
      AGORA,
    );
    const primeira = await central(usuario, '?limite=2');
    expect(primeira.itens).toHaveLength(2);
    expect(primeira.naoLidas).toBe(3);
    const segunda = await central(usuario, `?limite=2&cursor=${primeira.proximoCursor ?? ''}`);
    expect(segunda.itens).toHaveLength(1);
    expect(segunda.proximoCursor).toBeNull();
    expect((await central(usuario, '?tipo=fatura_fechada')).itens).toHaveLength(1);

    const id = primeira.itens[0]?.id ?? '';
    expect((await chamar('POST', outro, `/notificacoes/${id}/lida`)).statusCode).toBe(404);
    const lida = await chamar('POST', usuario, `/notificacoes/${id}/lida`);
    expect(lida.json<Notificacao>().lidaEm).not.toBeNull();
    expect((await central(usuario, '?naoLidas=true')).itens).toHaveLength(2);
    const inicio = await chamar('GET', usuario, '/dashboard');
    expect(inicio.json()).toMatchObject({ notificacoesNaoLidas: 2 });

    const todas = await chamar('POST', usuario, '/notificacoes/lidas');
    expect(todas.json()).toEqual({ afetadas: 2 });
    expect((await central(usuario)).naoLidas).toBe(0);
    expect((await central(outro)).itens).toEqual([]);
  });
});
