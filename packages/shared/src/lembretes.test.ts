import { describe, expect, it } from 'vitest';

import {
  completarRegra,
  escreverRegra,
  esquemaAtualizacaoLembrete,
  esquemaNovoLembrete,
  lerRegra,
  ocorrenciasDoLembrete,
  primeiraData,
  proximaData,
  proximaOcorrenciaDoLembrete,
  type RegraLembrete,
} from './lembretes.js';

const regra = (texto: string): RegraLembrete => {
  const lida = lerRegra(texto);
  if (!lida) throw new Error(`regra inválida: ${texto}`);
  return lida;
};

/** As `quantidade` datas seguintes a `inicio` (que é uma ocorrência). */
function seguintes(texto: string, inicio: string, quantidade: number): string[] {
  const completa = completarRegra(regra(texto), inicio);
  const datas: string[] = [];
  let atual = proximaData(completa, inicio);
  while (atual !== null && datas.length < quantidade) {
    datas.push(atual);
    atual = proximaData(completa, atual);
  }
  return datas;
}

describe('lerRegra e escreverRegra (RN-075)', () => {
  it('RN-075 diária, semanal, mensal, anual, com intervalo e fim', () => {
    expect(lerRegra('FREQ=DAILY')).toEqual({
      frequencia: 'diaria',
      intervalo: 1,
      diasDaSemana: [],
      diaDoMes: null,
      mes: null,
      ate: null,
    });
    expect(lerRegra('RRULE:freq=weekly;byday=we,mo;interval=2')).toMatchObject({
      frequencia: 'semanal',
      intervalo: 2,
      diasDaSemana: [1, 3],
    });
    expect(lerRegra('FREQ=MONTHLY;BYMONTHDAY=31;UNTIL=20271231')).toMatchObject({
      diaDoMes: 31,
      ate: '2027-12-31',
    });
    expect(lerRegra('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29')).toMatchObject({ mes: 2, diaDoMes: 29 });
  });

  it('a regra guardada é canônica', () => {
    expect(escreverRegra(regra('BYDAY=FR,MO;FREQ=WEEKLY;INTERVAL=1'))).toBe(
      'FREQ=WEEKLY;BYDAY=MO,FR',
    );
    expect(
      escreverRegra(regra('FREQ=YEARLY;INTERVAL=2;UNTIL=20300101;BYMONTHDAY=5;BYMONTH=3')),
    ).toBe('FREQ=YEARLY;INTERVAL=2;BYMONTH=3;BYMONTHDAY=5;UNTIL=20300101');
  });

  it('recusa o que está fora do subconjunto aceito', () => {
    for (const texto of [
      '',
      'FREQ=HOURLY',
      'FREQ=DAILY;COUNT=3',
      'FREQ=DAILY;INTERVAL=0',
      'FREQ=DAILY;INTERVAL=100',
      'FREQ=DAILY;BYDAY=MO',
      'FREQ=WEEKLY;BYDAY=MO,MO',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=MONTHLY;BYMONTHDAY=32',
      'FREQ=MONTHLY;BYMONTH=2',
      'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30',
      'FREQ=DAILY;UNTIL=20270231',
      'FREQ=DAILY;UNTIL=20270101T000000Z',
      'FREQ=DAILY;FREQ=WEEKLY',
      'FREQ=DAILY;;',
      'FREQ',
    ]) {
      expect(lerRegra(texto), texto).toBeNull();
    }
  });

  it('completa os dias, o dia do mês e o mês com a data do lembrete', () => {
    // 14/10/2026 é uma quarta.
    expect(completarRegra(regra('FREQ=WEEKLY'), '2026-10-14').diasDaSemana).toEqual([3]);
    expect(completarRegra(regra('FREQ=MONTHLY'), '2026-10-14').diaDoMes).toBe(14);
    expect(completarRegra(regra('FREQ=YEARLY'), '2026-10-14')).toMatchObject({
      mes: 10,
      diaDoMes: 14,
    });
  });
});

describe('as datas da repetição (RN-075)', () => {
  it('RN-075 diária a cada 2 dias, até a data final', () => {
    expect(seguintes('FREQ=DAILY;INTERVAL=2;UNTIL=20261020', '2026-10-14', 5)).toEqual([
      '2026-10-16',
      '2026-10-18',
      '2026-10-20',
    ]);
  });

  it('RN-075 semanal nos dias escolhidos e a cada 2 semanas, começando na segunda', () => {
    // 12/10/2026 é uma segunda.
    expect(seguintes('FREQ=WEEKLY;BYDAY=MO,WE', '2026-10-12', 4)).toEqual([
      '2026-10-14',
      '2026-10-19',
      '2026-10-21',
      '2026-10-26',
    ]);
    expect(seguintes('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,SU', '2026-10-12', 4)).toEqual([
      '2026-10-18',
      '2026-10-26',
      '2026-11-01',
      '2026-11-09',
    ]);
  });

  it('RN-075 mensal no dia 31 cai no último dia e volta ao 31', () => {
    expect(seguintes('FREQ=MONTHLY;BYMONTHDAY=31', '2027-01-31', 3)).toEqual([
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ]);
    expect(seguintes('FREQ=MONTHLY;INTERVAL=3', '2026-11-15', 2)).toEqual([
      '2027-02-15',
      '2027-05-15',
    ]);
  });

  it('RN-075 anual em 29 de fevereiro fica no 28 fora do bissexto', () => {
    expect(seguintes('FREQ=YEARLY', '2028-02-29', 4)).toEqual([
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ]);
  });

  it('a primeira data é a do lembrete ou a próxima que a regra aceita', () => {
    // Quarta 14/10: na segunda e na sexta, a primeira é a sexta.
    expect(primeiraData(regra('FREQ=WEEKLY;BYDAY=MO,FR'), '2026-10-14')).toBe('2026-10-16');
    expect(primeiraData(regra('FREQ=WEEKLY;BYDAY=MO,WE'), '2026-10-14')).toBe('2026-10-14');
    expect(primeiraData(regra('FREQ=WEEKLY;BYDAY=MO'), '2026-10-14')).toBe('2026-10-19');
    expect(primeiraData(regra('FREQ=MONTHLY;BYMONTHDAY=5'), '2026-10-14')).toBe('2026-11-05');
    expect(primeiraData(regra('FREQ=MONTHLY;BYMONTHDAY=31'), '2026-11-14')).toBe('2026-11-30');
    expect(primeiraData(regra('FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=1'), '2026-10-14')).toBe(
      '2027-03-01',
    );
    expect(primeiraData(regra('FREQ=DAILY'), '2026-10-14')).toBe('2026-10-14');
    expect(
      primeiraData(regra('FREQ=MONTHLY;BYMONTHDAY=5;UNTIL=20261031'), '2026-10-14'),
    ).toBeNull();
  });
});

describe('proximaOcorrenciaDoLembrete e ocorrenciasDoLembrete (RN-075)', () => {
  const SP = 'America/Sao_Paulo';

  it('RN-075 no mesmo horário local, e o que passou com a rotina parada não toca', () => {
    const diaria = completarRegra(regra('FREQ=DAILY'), '2026-10-14');
    const atual = new Date('2026-10-14T11:00:00Z'); // 08:00 em São Paulo
    expect(proximaOcorrenciaDoLembrete(diaria, atual, atual, SP)?.toISOString()).toBe(
      '2026-10-15T11:00:00.000Z',
    );
    // Três dias parada: a próxima é a primeira depois de agora.
    expect(
      proximaOcorrenciaDoLembrete(
        diaria,
        atual,
        new Date('2026-10-17T12:00:00Z'),
        SP,
      )?.toISOString(),
    ).toBe('2026-10-18T11:00:00.000Z');
  });

  it('acompanha o horário de verão do fuso', () => {
    const diaria = completarRegra(regra('FREQ=DAILY'), '2026-03-07');
    const atual = new Date('2026-03-07T13:00:00Z'); // 08:00 em Nova York (inverno)
    expect(
      proximaOcorrenciaDoLembrete(diaria, atual, atual, 'America/New_York')?.toISOString(),
    ).toBe('2026-03-08T12:00:00.000Z');
  });

  it('sem próxima quando a repetição acabou', () => {
    const ate = completarRegra(regra('FREQ=DAILY;UNTIL=20261014'), '2026-10-14');
    const atual = new Date('2026-10-14T11:00:00Z');
    expect(proximaOcorrenciaDoLembrete(ate, atual, atual, SP)).toBeNull();
  });

  it('as ocorrências até a data, no máximo o limite; o lembrete único tem uma só', () => {
    const atual = new Date('2026-10-14T11:00:00Z');
    const semanal = completarRegra(regra('FREQ=WEEKLY;BYDAY=MO,WE'), '2026-10-14');
    expect(
      ocorrenciasDoLembrete(semanal, atual, new Date('2026-10-27T00:00:00Z'), 50, SP).map((data) =>
        data.toISOString(),
      ),
    ).toEqual([
      '2026-10-14T11:00:00.000Z',
      '2026-10-19T11:00:00.000Z',
      '2026-10-21T11:00:00.000Z',
      '2026-10-26T11:00:00.000Z',
    ]);
    expect(
      ocorrenciasDoLembrete(semanal, atual, new Date('2027-10-27T00:00:00Z'), 3, SP),
    ).toHaveLength(3);
    expect(
      ocorrenciasDoLembrete(null, atual, new Date('2027-10-27T00:00:00Z'), 50, SP),
    ).toHaveLength(1);
    expect(ocorrenciasDoLembrete(null, atual, new Date('2026-10-13T00:00:00Z'), 50, SP)).toEqual(
      [],
    );
  });
});

describe('esquemas dos lembretes', () => {
  it('título, data e hora, repetição e canais; a ligação ainda não', () => {
    const dados = {
      titulo: '  Tomar remédio ',
      dataHora: '2026-10-15T11:00:00.000Z',
      recorrencia: 'FREQ=DAILY',
      canais: ['push', 'alarme'],
    };
    expect(esquemaNovoLembrete.parse(dados).titulo).toBe('Tomar remédio');
    expect(esquemaNovoLembrete.safeParse({ ...dados, recorrencia: 'FREQ=HOURLY' }).success).toBe(
      false,
    );
    expect(esquemaNovoLembrete.safeParse({ ...dados, canais: [] }).success).toBe(false);
    expect(esquemaNovoLembrete.safeParse({ ...dados, canais: ['push', 'push'] }).success).toBe(
      false,
    );
    expect(esquemaNovoLembrete.safeParse({ ...dados, canais: ['ligacao'] }).success).toBe(false);
    expect(
      esquemaNovoLembrete.safeParse({ ...dados, dataHora: '2026-10-15T08:00:00-03:00' }).success,
    ).toBe(true);
    expect(esquemaAtualizacaoLembrete.safeParse({}).success).toBe(false);
    expect(esquemaAtualizacaoLembrete.parse({ recorrencia: null })).toEqual({ recorrencia: null });
  });
});
