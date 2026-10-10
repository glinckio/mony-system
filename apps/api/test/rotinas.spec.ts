import { getQueueToken } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { Clock, ClockFixo } from '../src/core/clock/clock';
import { FILAS } from '../src/core/filas/filas';
import { ProcessadorRotinas, ROTINA, Rotina } from '../src/core/rotinas/rotinas';
import { RecorrenciasService } from '../src/modulos/recorrencias/recorrencias.service';

const AGORA = new Date('2026-10-10T03:30:00Z');

@Injectable()
class RotinaDeExemplo {
  readonly chamadas: Date[] = [];

  @Rotina({ nome: 'exemplo', padrao: '0 6 * * *' })
  rodar(agora: Date): Promise<string> {
    this.chamadas.push(agora);
    return Promise.resolve('feito');
  }
}

describe('rotinas agendadas (doc 09)', () => {
  async function montar() {
    const fila = { upsertJobScheduler: vi.fn(() => Promise.resolve({})) };
    const modulo = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [
        ProcessadorRotinas,
        RotinaDeExemplo,
        { provide: Clock, useValue: new ClockFixo(AGORA) },
        { provide: getQueueToken(FILAS.rotinas), useValue: fila },
      ],
    }).compile();
    await modulo.init();
    return { modulo, fila, processador: modulo.get(ProcessadorRotinas) };
  }

  it('acha os métodos com @Rotina e cria o agendador no fuso de São Paulo', async () => {
    const { fila, processador, modulo } = await montar();
    expect(processador.nomes()).toEqual(['exemplo']);
    expect(fila.upsertJobScheduler).toHaveBeenCalledWith(
      'exemplo',
      { pattern: '0 6 * * *', tz: 'America/Sao_Paulo' },
      { name: 'exemplo' },
    );
    await modulo.close();
  });

  it('o job chama a rotina com o instante do Clock; nome desconhecido é ignorado', async () => {
    const { processador, modulo } = await montar();
    await expect(processador.process({ name: 'exemplo' } as Job)).resolves.toBe('feito');
    expect(modulo.get(RotinaDeExemplo).chamadas).toEqual([AGORA]);
    await expect(processador.process({ name: 'outra' } as Job)).resolves.toBeNull();
    await modulo.close();
  });

  it('a geração de recorrências roda de hora em hora', () => {
    const metodo = Reflect.get(RecorrenciasService.prototype, 'gerarPendentes') as object;
    expect(Reflect.getMetadata(ROTINA, metodo)).toEqual({
      nome: 'gerar-recorrencias',
      padrao: '30 * * * *',
    });
  });
});
