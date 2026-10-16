/** Novidades (T-141d): situação, corpo do push e a rotina que manda o push. */
import { describe, expect, it } from 'vitest';

import type { AlertaCandidato, MotorAlertas } from '../src/modulos/notificacoes/motor-alertas';
import {
  CORPO_PUSH_MAXIMO,
  corpoDoPush,
  situacaoDaNovidade,
} from '../src/modulos/novidades/dominio/novidades';
import type { NovidadesRepository } from '../src/modulos/novidades/novidades.repository';
import { PushNovidades } from '../src/modulos/novidades/push-novidades';

const agora = new Date('2026-10-16T12:00:00Z');
const antes = new Date('2026-10-16T11:00:00Z');
const depois = new Date('2026-10-16T13:00:00Z');

describe('situacaoDaNovidade', () => {
  it('rascunho e desativada seguem o status', () => {
    expect(
      situacaoDaNovidade({ status: 'rascunho', publicadaEm: null, validade: null }, agora),
    ).toBe('rascunho');
    expect(
      situacaoDaNovidade({ status: 'arquivada', publicadaEm: antes, validade: null }, agora),
    ).toBe('desativada');
  });

  it('publicada é agendada antes da hora, no ar depois e vencida depois da validade', () => {
    expect(
      situacaoDaNovidade({ status: 'publicada', publicadaEm: depois, validade: null }, agora),
    ).toBe('agendada');
    expect(
      situacaoDaNovidade({ status: 'publicada', publicadaEm: antes, validade: depois }, agora),
    ).toBe('no_ar');
    expect(
      situacaoDaNovidade({ status: 'publicada', publicadaEm: antes, validade: agora }, agora),
    ).toBe('vencida');
  });
});

describe('corpoDoPush', () => {
  it('corta o texto longo em 900 caracteres com reticências', () => {
    expect(corpoDoPush('Curto')).toBe('Curto');
    const corpo = corpoDoPush('a'.repeat(2000));
    expect(corpo).toHaveLength(CORPO_PUSH_MAXIMO);
    expect(corpo.endsWith('…')).toBe(true);
  });
});

describe('PushNovidades.enviar', () => {
  it('manda a novidade pendente a todas as contas ativas, em lotes, e marca o envio', async () => {
    const usuarios = Array.from(
      { length: 1200 },
      (_, i) => `usuario-${String(i).padStart(4, '0')}`,
    );
    const marcadas: string[] = [];
    const lotes: AlertaCandidato[][] = [];
    const repositorio = {
      pendentesDePush: () =>
        Promise.resolve([{ id: 'n1', titulo: 'Novo relatório', descricao: 'Veja o que mudou.' }]),
      usuariosAtivos: (depoisDe: string | undefined, lote: number) => {
        const inicio = depoisDe ? usuarios.indexOf(depoisDe) + 1 : 0;
        return Promise.resolve(usuarios.slice(inicio, inicio + lote));
      },
      marcarPushEnviado: (id: string) => {
        marcadas.push(id);
        return Promise.resolve();
      },
    } as unknown as NovidadesRepository;
    const motor = {
      emitir: (candidatos: AlertaCandidato[]) => {
        lotes.push(candidatos);
        return Promise.resolve({
          enviadas: candidatos.map((c) => c.usuarioId),
          adiadas: [],
          descartadas: [],
        });
      },
    } as unknown as MotorAlertas;

    await expect(new PushNovidades(repositorio, motor).enviar(agora)).resolves.toEqual({
      novidades: 1,
      enviadas: 1200,
    });
    expect(lotes.map((lote) => lote.length)).toEqual([500, 500, 200]);
    expect(lotes[0]?.[0]).toEqual({
      usuarioId: 'usuario-0000',
      tipo: 'novidade',
      chaveUnica: 'novidade:n1',
      urgente: false,
      titulo: 'Novo relatório',
      corpo: 'Veja o que mudou.',
      linkInterno: 'mony://notificacoes',
      vaiParaChat: false,
    });
    expect(marcadas).toEqual(['n1']);
  });
});
