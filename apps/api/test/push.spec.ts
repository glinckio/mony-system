import type { Job, Queue } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import type { Configuracao } from '../src/core/config/configuracao';
import {
  type Buscar,
  PushExpo,
  URL_ENVIO_EXPO,
  URL_RECIBOS_EXPO,
} from '../src/integracoes/push/push-expo';
import { PushFake } from '../src/integracoes/push/push-fake';
import { criarProvedorPush } from '../src/integracoes/push/push.module';
import { ErroPush, type MensagemPush } from '../src/integracoes/push/push.provider';
import type {
  EnvioDeNotificacoes,
  NotificacaoParaEnvio,
} from '../src/modulos/notificacoes/envio-notificacoes';
import {
  EnvioPush,
  JOB_CONFERIR_RECIBOS,
  JOB_ENVIAR_PUSH,
} from '../src/modulos/notificacoes/envio-push';
import type { NotificacoesRepository } from '../src/modulos/notificacoes/notificacoes.repository';
import {
  montarMensagens,
  ProcessadorNotificacoes,
} from '../src/modulos/notificacoes/processador-notificacoes';
import { criarFilaFalsa } from './utilitarios';

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function corpo(opcoes: RequestInit | undefined): unknown {
  return typeof opcoes?.body === 'string' ? JSON.parse(opcoes.body) : undefined;
}

function mensagem(para: string, extra: Partial<MensagemPush> = {}): MensagemPush {
  return {
    para,
    titulo: 'Título',
    corpo: 'Corpo',
    dados: { linkInterno: 'mony://inicio' },
    canal: 'alertas',
    ...extra,
  };
}

function notificacao(extra: Partial<NotificacaoParaEnvio> = {}): NotificacaoParaEnvio {
  return {
    id: '0199a000-0000-7000-8000-000000000001',
    tipo: 'orcamento',
    titulo: 'Mercado em 80%',
    corpo: 'Você já usou 80% do orçamento de Mercado.',
    linkInterno: 'mony://orcamentos',
    ...extra,
  };
}

describe('PushExpo', () => {
  it('manda em lotes de 100, com o token de acesso e a categoria, e devolve os tickets na ordem', async () => {
    const buscar = vi.fn<Buscar>((_url, opcoes) => {
      const lote = corpo(opcoes) as { to: string }[];
      return Promise.resolve(
        respostaJson({
          data: lote.map(({ to }) =>
            to.endsWith('[7]')
              ? {
                  status: 'error',
                  message: 'não registrado',
                  details: { error: 'DeviceNotRegistered' },
                }
              : { status: 'ok', id: `ticket-${to}` },
          ),
        }),
      );
    });
    const push = new PushExpo('segredo-expo', buscar);
    const mensagens = Array.from({ length: 150 }, (_, indice) =>
      mensagem(
        `ExponentPushToken[${String(indice)}]`,
        indice === 0 ? { categoria: 'lembrete', canal: 'lembretes' } : {},
      ),
    );

    const tickets = await push.enviar(mensagens);

    expect(buscar).toHaveBeenCalledTimes(2);
    const [url, opcoes] = buscar.mock.calls[0] ?? [];
    expect(url).toBe(URL_ENVIO_EXPO);
    expect(opcoes?.headers).toMatchObject({
      authorization: 'Bearer segredo-expo',
      'content-type': 'application/json',
    });
    const primeiroLote = corpo(opcoes) as Record<string, unknown>[];
    expect(primeiroLote).toHaveLength(100);
    expect(primeiroLote[0]).toEqual({
      to: 'ExponentPushToken[0]',
      title: 'Título',
      body: 'Corpo',
      data: { linkInterno: 'mony://inicio' },
      sound: 'default',
      priority: 'high',
      channelId: 'lembretes',
      categoryId: 'lembrete',
    });
    expect(primeiroLote[1]).not.toHaveProperty('categoryId');
    expect(tickets).toHaveLength(150);
    expect(tickets[0]).toEqual({ situacao: 'aceita', id: 'ticket-ExponentPushToken[0]' });
    expect(tickets[7]).toEqual({
      situacao: 'erro',
      erro: 'DeviceNotRegistered',
      mensagem: 'não registrado',
    });
  });

  it('sem token de acesso não manda o cabeçalho de autorização', async () => {
    const buscar = vi.fn<Buscar>(() =>
      Promise.resolve(respostaJson({ data: [{ status: 'ok', id: 'a' }] })),
    );
    await new PushExpo(undefined, buscar).enviar([mensagem('t')]);
    const [, opcoes] = buscar.mock.calls[0] ?? [];
    expect(opcoes?.headers).not.toHaveProperty('authorization');
  });

  it('consulta os recibos e traduz entregues e erros', async () => {
    const buscar = vi.fn<Buscar>(() =>
      Promise.resolve(
        respostaJson({
          data: {
            a: { status: 'ok' },
            b: { status: 'error', message: 'saiu', details: { error: 'DeviceNotRegistered' } },
          },
        }),
      ),
    );
    const recibos = await new PushExpo(undefined, buscar).recibos(['a', 'b', 'c']);
    const [url, opcoes] = buscar.mock.calls[0] ?? [];
    expect(url).toBe(URL_RECIBOS_EXPO);
    expect(corpo(opcoes)).toEqual({ ids: ['a', 'b', 'c'] });
    expect(recibos.get('a')).toEqual({ situacao: 'entregue' });
    expect(recibos.get('b')).toEqual({
      situacao: 'erro',
      erro: 'DeviceNotRegistered',
      mensagem: 'saiu',
    });
    expect(recibos.has('c')).toBe(false);
  });

  it('4xx é erro permanente; 429, 5xx e falha de rede podem ser repetidos', async () => {
    const com = (resposta: () => Promise<Response>) =>
      new PushExpo(undefined, vi.fn<Buscar>(resposta)).enviar([mensagem('t')]);

    const recusado = await com(() => Promise.resolve(respostaJson({ errors: [] }, 400))).catch(
      (erro: unknown) => erro,
    );
    expect(recusado).toBeInstanceOf(ErroPush);
    expect((recusado as ErroPush).permanente).toBe(true);

    for (const status of [429, 503]) {
      const erro = await com(() => Promise.resolve(respostaJson({}, status))).catch(
        (falha: unknown) => falha,
      );
      expect((erro as ErroPush).permanente).toBe(false);
    }

    const semRede = await com(() => Promise.reject(new Error('ECONNRESET'))).catch(
      (erro: unknown) => erro,
    );
    expect((semRede as ErroPush).permanente).toBe(false);
    expect((semRede as ErroPush).message).toContain('ECONNRESET');
  });
});

describe('criarProvedorPush', () => {
  it('escolhe pelo PUSH_PROVEDOR', () => {
    const config = (provedorPush: 'fake' | 'expo') =>
      ({ provedorPush, tokenAcessoExpo: undefined, ehProducao: false }) as unknown as Configuracao;
    expect(criarProvedorPush(config('expo'))).toBeInstanceOf(PushExpo);
    expect(criarProvedorPush(config('fake'))).toBeInstanceOf(PushFake);
  });
});

describe('montarMensagens', () => {
  it('uma notificação: título, corpo, link e categoria de ação do tipo', () => {
    const envio: EnvioDeNotificacoes = {
      usuarioId: 'u',
      agrupada: false,
      notificacoes: [
        notificacao({
          tipo: 'fatura_atrasada',
          linkInterno: 'mony://faturas/f1',
          titulo: 'Atrasou',
        }),
      ],
    };
    expect(montarMensagens(envio, ['t1', 't2'])).toEqual([
      {
        para: 't1',
        titulo: 'Atrasou',
        corpo: 'Você já usou 80% do orçamento de Mercado.',
        dados: {
          linkInterno: 'mony://faturas/f1',
          notificacaoId: '0199a000-0000-7000-8000-000000000001',
          tipo: 'fatura_atrasada',
        },
        categoria: 'fatura_atrasada',
        canal: 'alertas',
      },
      expect.objectContaining({ para: 't2', titulo: 'Atrasou' }),
    ]);
    const semAcao = montarMensagens({ ...envio, notificacoes: [notificacao()] }, ['t1']);
    expect(semAcao[0]?.categoria).toBeUndefined();
    const lembrete = montarMensagens(
      { ...envio, notificacoes: [notificacao({ tipo: 'lembrete' })] },
      ['t1'],
    );
    expect(lembrete[0]).toMatchObject({ categoria: 'lembrete', canal: 'lembretes' });
  });

  it('agrupada: um push que abre a central, com os títulos', () => {
    const envio: EnvioDeNotificacoes = {
      usuarioId: 'u',
      agrupada: true,
      notificacoes: ['A', 'B', 'C', 'D'].map((titulo, indice) =>
        notificacao({ id: `id-${String(indice)}`, titulo }),
      ),
    };
    const [unica] = montarMensagens(envio, ['t1']);
    expect(unica).toEqual({
      para: 't1',
      titulo: 'Você tem 4 alertas',
      corpo: 'A · B · C · D',
      dados: {
        linkInterno: 'mony://notificacoes',
        notificacaoIds: ['id-0', 'id-1', 'id-2', 'id-3'],
      },
      categoria: undefined,
      canal: 'alertas',
    });
  });

  it('corta texto longo para caber no limite do push', () => {
    const [unica] = montarMensagens(
      {
        usuarioId: 'u',
        agrupada: false,
        notificacoes: [notificacao({ titulo: 'x'.repeat(500), corpo: 'y'.repeat(5000) })],
      },
      ['t'],
    );
    expect(unica?.titulo).toHaveLength(120);
    expect(unica?.titulo.endsWith('…')).toBe(true);
    expect(unica?.corpo).toHaveLength(900);
  });
});

describe('EnvioPush', () => {
  it('põe o envio na fila notificacoes com id único e prazo no Redis', async () => {
    const fila = criarFilaFalsa();
    const envio: EnvioDeNotificacoes = {
      usuarioId: 'u',
      agrupada: false,
      notificacoes: [notificacao()],
    };
    await new EnvioPush(fila as unknown as Queue).enviar(envio);
    await new EnvioPush(fila as unknown as Queue).enviar({ ...envio, notificacoes: [] });
    expect(fila.add).toHaveBeenCalledTimes(1);
    expect(fila.add).toHaveBeenCalledWith(JOB_ENVIAR_PUSH, envio, {
      jobId: 'push-0199a000-0000-7000-8000-000000000001-1',
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86_400 },
    });
  });
});

describe('ProcessadorNotificacoes', () => {
  function montar(aparelhos: { id: string; token: string }[]) {
    const push = new PushFake();
    const fila = criarFilaFalsa();
    const repositorio = {
      aparelhosComPush: vi.fn(() => Promise.resolve(aparelhos)),
      desligarPush: vi.fn(() => Promise.resolve(true)),
    };
    const processador = new ProcessadorNotificacoes(
      push,
      repositorio as unknown as NotificacoesRepository,
      fila as unknown as Queue,
    );
    const job = (name: string, data: unknown) => ({ name, data }) as Job;
    return { push, fila, repositorio, processador, job };
  }

  const envio: EnvioDeNotificacoes = {
    usuarioId: 'u',
    agrupada: false,
    notificacoes: [notificacao()],
  };

  it('manda para cada aparelho, desliga o token recusado e agenda os recibos para 15 minutos', async () => {
    const { push, fila, repositorio, processador, job } = montar([
      { id: 'd1', token: 'ExponentPushToken[bom]' },
      { id: 'd2', token: 'ExponentPushToken[invalido]' },
      { id: 'd3', token: 'ExponentPushToken[saiu]' },
    ]);

    expect(await processador.process(job(JOB_ENVIAR_PUSH, envio))).toEqual({ enviadas: 2 });
    expect(push.enviadas.map(({ para }) => para)).toHaveLength(3);
    expect(repositorio.desligarPush).toHaveBeenCalledExactlyOnceWith(
      'd2',
      'ExponentPushToken[invalido]',
    );
    expect(fila.add).toHaveBeenCalledExactlyOnceWith(
      JOB_CONFERIR_RECIBOS,
      {
        tickets: [
          expect.objectContaining({ dispositivoId: 'd1', token: 'ExponentPushToken[bom]' }),
          expect.objectContaining({ dispositivoId: 'd3', token: 'ExponentPushToken[saiu]' }),
        ],
      },
      { delay: 15 * 60 * 1000, removeOnComplete: true, removeOnFail: { age: 86_400 } },
    );

    const [, dados] = fila.add.mock.calls[0] ?? [];
    repositorio.desligarPush.mockClear();
    expect(await processador.process(job(JOB_CONFERIR_RECIBOS, dados))).toEqual({
      conferidos: 2,
      desligados: 1,
    });
    expect(repositorio.desligarPush).toHaveBeenCalledExactlyOnceWith(
      'd3',
      'ExponentPushToken[saiu]',
    );
  });

  it('sem aparelho com token não chama o provedor', async () => {
    const { push, fila, processador, job } = montar([]);
    expect(await processador.process(job(JOB_ENVIAR_PUSH, envio))).toEqual({ enviadas: 0 });
    expect(push.enviadas).toEqual([]);
    expect(fila.add).not.toHaveBeenCalled();
  });

  it('erro permanente do provedor vai direto para as falhas; o temporário volta para a fila', async () => {
    const { push, processador, job } = montar([{ id: 'd1', token: 't' }]);
    const enviar = vi.spyOn(push, 'enviar');

    enviar.mockRejectedValueOnce(new ErroPush('400', true));
    await expect(processador.process(job(JOB_ENVIAR_PUSH, envio))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );

    enviar.mockRejectedValueOnce(new ErroPush('503', false));
    await expect(processador.process(job(JOB_ENVIAR_PUSH, envio))).rejects.toBeInstanceOf(ErroPush);
  });

  it('depois que o push saiu, falha nos recibos não faz o job repetir o envio', async () => {
    const { push, fila, processador, job } = montar([{ id: 'd1', token: 't' }]);
    fila.add.mockRejectedValueOnce(new Error('Redis caiu'));
    expect(await processador.process(job(JOB_ENVIAR_PUSH, envio))).toEqual({ enviadas: 1 });
    expect(push.enviadas).toHaveLength(1);
  });
});
