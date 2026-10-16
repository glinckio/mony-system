import { LIMITES_MONY_PADRAO } from '@mony/shared/admin';
import { describe, expect, it } from 'vitest';

import { ClockFixo } from '../src/core/clock/clock';
import {
  avisoDoLimiteDiario,
  LimitesMonyService,
  VALIDADE_LIMITES_MONY_MS,
} from '../src/modulos/mony/limites.service';
import type { MonyRepository } from '../src/modulos/mony/mony.repository';

/** O repositório com a linha de `configuracoes` e a contagem que o teste pede. */
function servico(opcoes: { valor?: unknown; falhar?: boolean; contados?: number } = {}) {
  const clock = new ClockFixo('2026-10-15T15:00:00Z');
  const chamadas = { leituras: 0, desde: [] as Date[], tipos: [] as string[][] };
  const repositorio = {
    configuracao: (): Promise<unknown> => {
      chamadas.leituras += 1;
      return opcoes.falhar
        ? Promise.reject(new Error('banco fora'))
        : Promise.resolve(opcoes.valor);
    },
    fusoDoUsuario: () => Promise.resolve('America/Sao_Paulo'),
    contarMensagensDoUsuario: (_usuarioId: string, desde: Date, tipos: readonly string[]) => {
      chamadas.desde.push(desde);
      chamadas.tipos.push([...tipos]);
      return Promise.resolve(opcoes.contados ?? 0);
    },
  } as unknown as MonyRepository;
  return { limites: new LimitesMonyService(repositorio, clock), clock, chamadas };
}

describe('limites diários da Mony (T-151)', () => {
  it('T-151 sem linha, com uma que não se lê ou com o banco fora, valem os padrões', async () => {
    expect(await servico().limites.obter()).toEqual(LIMITES_MONY_PADRAO);
    expect(await servico({ valor: { mensagensPorDia: 0 } }).limites.obter()).toEqual(
      LIMITES_MONY_PADRAO,
    );
    expect(await servico({ falhar: true }).limites.obter()).toEqual(LIMITES_MONY_PADRAO);
    expect(
      await servico({ valor: { mensagensPorDia: 50, leiturasPorDia: 5 } }).limites.obter(),
    ).toEqual({ mensagensPorDia: 50, leiturasPorDia: 5 });
  });

  it('T-151 cada processo guarda os limites por 30 s; esquecer lê de novo', async () => {
    const { limites, clock, chamadas } = servico({ valor: LIMITES_MONY_PADRAO });
    await limites.obter();
    await limites.obter();
    expect(chamadas.leituras).toBe(1);
    clock.avancar(VALIDADE_LIMITES_MONY_MS);
    await limites.obter();
    expect(chamadas.leituras).toBe(2);
    limites.esquecer();
    await limites.obter();
    expect(chamadas.leituras).toBe(3);
  });

  it('T-151 conta desde a meia-noite no fuso do usuário e avisa ao chegar no limite', async () => {
    const valor = { mensagensPorDia: 3, leiturasPorDia: 2 };
    const abaixo = servico({ valor, contados: 2 });
    expect(await abaixo.limites.conferir('u1', 'mensagem')).toBeNull();
    expect(abaixo.chamadas.desde).toEqual([new Date('2026-10-15T03:00:00Z')]);
    expect(abaixo.chamadas.tipos).toEqual([['texto', 'audio']]);

    const no = servico({ valor, contados: 2 });
    expect(await no.limites.conferir('u1', 'leitura')).toBe(avisoDoLimiteDiario('leitura', 2));
    expect(no.chamadas.tipos).toEqual([['imagem', 'pdf']]);
  });
});
