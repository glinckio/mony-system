/** Alertas técnicos do worker (T-142a, doc 12): quando alertam, para quem e sem repetir. */
import { getQueueToken } from '@nestjs/bullmq';
import type { ModuleRef } from '@nestjs/core';
import { MONITORAMENTO_PADRAO, type Parametros } from '@mony/shared/admin';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { ClockFixo } from '../src/core/clock/clock';
import type { Configuracao } from '../src/core/config/configuracao';
import { FILAS } from '../src/core/filas/filas';
import type { ParametrosService } from '../src/core/parametros/parametros';
import { EmailFake } from '../src/integracoes/email/email-fake';
import {
  alertaDeFalhasDeWebhook,
  alertaDeFilaParada,
  alertaDoCustoIa,
  dolares,
} from '../src/modulos/monitoramento/dominio/alertas-tecnicos';
import type { MonitoramentoRepository } from '../src/modulos/monitoramento/monitoramento.repository';
import { MonitoramentoService } from '../src/modulos/monitoramento/monitoramento.service';

const MINUTO = 60_000;

describe('alertas técnicos: decisão (T-142a)', () => {
  it('T-142a fila parada só quando o mais antigo espera mais que o limite', () => {
    expect(alertaDeFilaParada('emails', null, 0, 15)).toBeNull();
    expect(alertaDeFilaParada('emails', 15 * MINUTO, 3, 15)).toBeNull();
    const alerta = alertaDeFilaParada('emails', 16 * MINUTO + 30_000, 3, 15);
    expect(alerta).toMatchObject({ tipo: 'fila_parada', chave: 'emails' });
    expect(alerta?.texto).toContain('3 job(s) esperando');
    expect(alerta?.texto).toContain('há 16 minutos (limite: 15)');
  });

  it('T-142a falha de webhook avisa só quando o número de falhas cresce', () => {
    expect(alertaDeFalhasDeWebhook('webhooks', 0, 0)).toBeNull();
    expect(alertaDeFalhasDeWebhook('webhooks', 2, 2)).toBeNull();
    expect(alertaDeFalhasDeWebhook('webhooks', 1, 2)).toBeNull();
    expect(alertaDeFalhasDeWebhook('webhooks', 3, 2)).toMatchObject({
      tipo: 'falhas_webhook',
      chave: 'webhooks',
    });
  });

  it('T-142a custo de IA no limite ou acima; limite 0 desliga', () => {
    expect(alertaDoCustoIa('2026-10-16', 4_999, 5_000, [])).toBeNull();
    expect(alertaDoCustoIa('2026-10-16', 999_999, 0, [])).toBeNull();
    const alerta = alertaDoCustoIa('2026-10-16', 5_000, 5_000, ['modelo-novo']);
    expect(alerta).toMatchObject({ tipo: 'custo_ia', chave: '2026-10-16' });
    expect(alerta?.assunto).toBe('Custo de IA de hoje passou de US$ 50,00');
    expect(alerta?.texto).toContain('já é US$ 50,00');
    expect(alerta?.texto).toContain('modelo-novo');
  });

  it('dólares com vírgula e milhar', () => {
    expect(dolares(5)).toBe('US$ 0,05');
    expect(dolares(123_456)).toBe('US$ 1.234,56');
  });
});

/** Redis em memória com o pouco que a rotina usa. */
function redisFalso() {
  const dados = new Map<string, string>();
  return {
    dados,
    set: vi.fn((chave: string, valor: string, ...opcoes: unknown[]) => {
      if (opcoes.includes('NX') && dados.has(chave)) return Promise.resolve(null);
      dados.set(chave, valor);
      return Promise.resolve('OK');
    }),
    get: vi.fn((chave: string) => Promise.resolve(dados.get(chave) ?? null)),
    del: vi.fn((chave: string) => Promise.resolve(dados.delete(chave) ? 1 : 0)),
  };
}

function filaFalsa() {
  return {
    maisAntigo: null as { timestamp: number } | null,
    aguardando: 0,
    falhos: 0,
    getJobs: vi.fn(function (this: { maisAntigo: unknown }) {
      return Promise.resolve(this.maisAntigo ? [this.maisAntigo] : []);
    }),
    getWaitingCount: vi.fn(function (this: { aguardando: number }) {
      return Promise.resolve(this.aguardando);
    }),
    getFailedCount: vi.fn(function (this: { falhos: number }) {
      return Promise.resolve(this.falhos);
    }),
  };
}

function cenario(opcoes: { emails?: string[]; custo?: number } = {}) {
  const clock = new ClockFixo('2026-10-16T15:00:00Z');
  const filas = new Map(Object.values(FILAS).map((nome) => [nome, filaFalsa()]));
  const redis = redisFalso();
  const email = new EmailFake(false);
  const monitoramento = { ...MONITORAMENTO_PADRAO };
  const custoIa = vi.fn(() =>
    Promise.resolve({ centavos: opcoes.custo ?? 0, modelosSemPreco: [] as string[] }),
  );
  const servico = new MonitoramentoService(
    {
      get: (token: string) =>
        Object.values(FILAS)
          .filter((nome) => getQueueToken(nome) === token)
          .map((nome) => filas.get(nome))[0],
    } as unknown as ModuleRef,
    { custoIa } as unknown as MonitoramentoRepository,
    { obter: () => Promise.resolve({ monitoramento } as Parametros) } as ParametrosService,
    email,
    {
      emailsAlertasTecnicos: opcoes.emails ?? ['tecnico@exemplo.test'],
      urlPublicaApi: 'https://api.staging.exemplo.test',
    } as Configuracao,
    clock,
    redis as unknown as Redis,
  );
  const fila = (nome: string) => {
    const encontrada = filas.get(nome as never);
    if (!encontrada) throw new Error(nome);
    return encontrada;
  };
  return { servico, clock, fila, redis, email, monitoramento, custoIa };
}

describe('rotina monitorar (T-142a)', () => {
  it('T-142a sem nada errado não alerta e não manda e-mail', async () => {
    const { servico, clock, email } = cenario();
    expect(await servico.monitorar(clock.agora())).toEqual([]);
    expect(email.enviados).toEqual([]);
  });

  it('T-142a fila parada alerta por e-mail, uma vez por hora enquanto continuar parada', async () => {
    const { servico, clock, fila, redis, email } = cenario({
      emails: ['a@exemplo.test', 'b@exemplo.test'],
    });
    const emails = fila('emails');
    emails.maisAntigo = { timestamp: clock.agora().getTime() - 20 * MINUTO };
    emails.aguardando = 7;

    const alertas = await servico.monitorar(clock.agora());
    expect(alertas.map(({ tipo, chave }) => [tipo, chave])).toEqual([['fila_parada', 'emails']]);
    expect(email.enviados.map((enviado) => enviado.para.email)).toEqual([
      'a@exemplo.test',
      'b@exemplo.test',
    ]);
    expect(email.enviados[0]?.assunto).toBe('[Monitorizze] Fila emails parada');
    expect(email.enviados[0]?.texto).toContain('https://api.staging.exemplo.test');

    // Cinco minutos depois, ainda parada: não repete.
    expect(await servico.monitorar(clock.agora())).toEqual([]);
    expect(email.enviados).toHaveLength(2);
    // Passada a hora (a chave expira no Redis), avisa de novo.
    redis.dados.clear();
    expect(await servico.monitorar(clock.agora())).toHaveLength(1);
  });

  it('T-142a falha no webhook avisa de novo só com mais falhas, e zera quando some', async () => {
    const { servico, clock, fila, redis } = cenario();
    const webhooks = fila('webhooks');
    webhooks.falhos = 1;
    expect(await servico.monitorar(clock.agora())).toHaveLength(1);
    expect(await servico.monitorar(clock.agora())).toEqual([]);
    webhooks.falhos = 2;
    expect((await servico.monitorar(clock.agora())).map(({ chave }) => chave)).toEqual([
      'webhooks',
    ]);
    // Alguém reprocessou todas: zera, e a próxima falha avisa.
    webhooks.falhos = 0;
    expect(await servico.monitorar(clock.agora())).toEqual([]);
    expect(redis.dados.has('monitoramento:falhas:webhooks')).toBe(false);
    webhooks.falhos = 1;
    expect(await servico.monitorar(clock.agora())).toHaveLength(1);
    // Falha em outra fila (e-mails) não é de webhook.
    fila('emails').falhos = 5;
    expect(await servico.monitorar(clock.agora())).toEqual([]);
  });

  it('T-142a custo de IA de hoje (São Paulo) acima do limite avisa uma vez no dia', async () => {
    const { servico, clock, custoIa, monitoramento } = cenario({ custo: 7_500 });
    const [alerta] = await servico.monitorar(clock.agora());
    expect(alerta).toMatchObject({ tipo: 'custo_ia', chave: '2026-10-16' });
    expect(custoIa).toHaveBeenCalledWith(
      new Date('2026-10-16T03:00:00Z'),
      new Date('2026-10-17T03:00:00Z'),
    );
    expect(await servico.monitorar(clock.agora())).toEqual([]);

    // Limite 0 desliga: nem consulta o custo.
    monitoramento.custoIaDiarioCentavos = 0;
    custoIa.mockClear();
    expect(await servico.monitorar(clock.agora())).toEqual([]);
    expect(custoIa).not.toHaveBeenCalled();
  });

  it('T-142a sem destinatário, só o log; com o e-mail fora, tenta de novo na próxima volta', async () => {
    const semEmail = cenario({ emails: [] });
    semEmail.fila('webhooks').falhos = 1;
    expect(await semEmail.servico.monitorar(semEmail.clock.agora())).toHaveLength(1);
    expect(semEmail.email.enviados).toEqual([]);

    const { servico, clock, fila, email } = cenario();
    fila('webhooks').falhos = 1;
    const enviar = vi.spyOn(email, 'enviar').mockRejectedValueOnce(new Error('Brevo fora'));
    expect(await servico.monitorar(clock.agora())).toEqual([]);
    expect(await servico.monitorar(clock.agora())).toHaveLength(1);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('T-142a uma verificação com erro não impede as outras', async () => {
    const { servico, clock, fila, custoIa } = cenario();
    custoIa.mockRejectedValueOnce(new Error('banco fora'));
    fila('emails').getJobs.mockRejectedValueOnce(new Error('redis fora'));
    fila('webhooks').falhos = 1;
    const alertas = await servico.monitorar(clock.agora());
    expect(alertas.map(({ tipo }) => tipo)).toEqual(['falhas_webhook']);
  });
});
