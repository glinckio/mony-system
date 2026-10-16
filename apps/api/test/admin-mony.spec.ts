/** A seção Mony do painel (T-141e): situação da avaliação, custo pela tabela e o pedido à fila. */
import type { Queue } from 'bullmq';
import { esquemaConsultaCustoMonyAdmin, esquemaPrecosIaAdmin } from '@mony/shared/admin';
import { describe, expect, it, vi } from 'vitest';

import { ClockFixo } from '../src/core/clock/clock';
import type { Configuracao } from '../src/core/config/configuracao';
import type { AdminMonyRepository } from '../src/modulos/admin/admin-mony.repository';
import { AdminMonyService } from '../src/modulos/admin/admin-mony.service';
import {
  AVALIACAO_PARADA_MS,
  custoDoModelo,
  MOTIVO_AVALIACAO_PARADA,
  situacaoDaAvaliacao,
} from '../src/modulos/admin/dominio/mony';
import {
  type DadosJobAvaliacao,
  motivoDaFalha,
} from '../src/modulos/mony/avaliacao/pedidos-avaliacao';
import type { ConfigMonyService } from '../src/modulos/mony/config.service';

const agora = new Date('2026-10-16T12:00:00Z');
const antes = (ms: number) => new Date(agora.getTime() - ms);

describe('situacaoDaAvaliacao', () => {
  it('sem pedido nem resultado: nunca; com resultado: concluída', () => {
    expect(situacaoDaAvaliacao({ avaliadaEm: null, pedidaEm: null, falha: null, agora })).toEqual({
      situacao: 'nunca',
      falha: null,
    });
    expect(
      situacaoDaAvaliacao({ avaliadaEm: antes(10), pedidaEm: antes(60_000), falha: null, agora }),
    ).toEqual({ situacao: 'concluida', falha: null });
  });

  it('pedida e sem resultado mais novo: em andamento, até o tempo de parada', () => {
    expect(
      situacaoDaAvaliacao({ avaliadaEm: antes(60_000), pedidaEm: antes(1000), falha: null, agora }),
    ).toEqual({ situacao: 'em_andamento', falha: null });
    expect(
      situacaoDaAvaliacao({
        avaliadaEm: null,
        pedidaEm: antes(AVALIACAO_PARADA_MS + 1),
        falha: null,
        agora,
      }),
    ).toEqual({ situacao: 'falhou', falha: MOTIVO_AVALIACAO_PARADA });
  });

  it('a falha gravada pelo worker vale primeiro', () => {
    expect(
      situacaoDaAvaliacao({
        avaliadaEm: antes(10),
        pedidaEm: antes(1000),
        falha: 'sem rede',
        agora,
      }),
    ).toEqual({ situacao: 'falhou', falha: 'sem rede' });
  });
});

describe('custoDoModelo', () => {
  const precos = [{ modelo: 'm', entradaCentavosPorMilhao: 300, saidaCentavosPorMilhao: 1500 }];

  it('tokens vezes o preço por milhão, arredondado uma vez no fim', () => {
    expect(
      custoDoModelo({ modelo: 'm', tokensEntrada: 1_000_000, tokensSaida: 100_000 }, precos),
    ).toBe(450);
    // 0,5 centavo arredonda para cima; 0,4 para baixo.
    expect(custoDoModelo({ modelo: 'm', tokensEntrada: 0, tokensSaida: 333 }, precos)).toBe(0);
    expect(custoDoModelo({ modelo: 'm', tokensEntrada: 0, tokensSaida: 334 }, precos)).toBe(1);
  });

  it('não estoura com bilhões de tokens', () => {
    expect(
      custoDoModelo({ modelo: 'm', tokensEntrada: 2_000_000_000, tokensSaida: 0 }, precos),
    ).toBe(600_000);
  });

  it('modelo fora da tabela: null', () => {
    expect(custoDoModelo({ modelo: 'outro', tokensEntrada: 1, tokensSaida: 1 }, precos)).toBeNull();
  });
});

describe('motivoDaFalha', () => {
  it('a última linha com texto, cortada', () => {
    expect(motivoDaFalha('ok\nFALHOU caso: x\n\n  Erro final  \n', 1)).toBe('Erro final');
    expect(motivoDaFalha('x'.repeat(900), 1)).toHaveLength(500);
  });

  it('sem saída: o código ou que não terminou', () => {
    expect(motivoDaFalha('', 1)).toBe('Saiu com o código 1.');
    expect(motivoDaFalha('', null)).toBe('O processo não terminou.');
  });
});

describe('esquemas da seção Mony', () => {
  it('a tabela de preços não repete modelo', () => {
    const linha = { modelo: 'm', entradaCentavosPorMilhao: 1, saidaCentavosPorMilhao: 1 };
    expect(esquemaPrecosIaAdmin.safeParse({ precos: [linha] }).success).toBe(true);
    expect(esquemaPrecosIaAdmin.safeParse({ precos: [linha, linha] }).success).toBe(false);
  });

  it('o custo vai até 1 ano, contando o primeiro dia', () => {
    expect(
      esquemaConsultaCustoMonyAdmin.safeParse({ de: '2026-01-01', ate: '2026-12-31' }).success,
    ).toBe(true);
    expect(
      esquemaConsultaCustoMonyAdmin.safeParse({ de: '2025-10-16', ate: '2026-10-16' }).success,
    ).toBe(true);
    expect(
      esquemaConsultaCustoMonyAdmin.safeParse({ de: '2025-10-15', ate: '2026-10-16' }).success,
    ).toBe(false);
    expect(
      esquemaConsultaCustoMonyAdmin.safeParse({ de: '2026-10-17', ate: '2026-10-16' }).success,
    ).toBe(false);
  });
});

describe('AdminMonyService', () => {
  const linha = {
    versao: 3,
    promptSistema: 'Prompt',
    ferramentas: { descricoes: {} },
    modelo: 'claude',
    ativo: false,
    avaliacao: null,
    avaliacaoPedidaEm: null,
    avaliacaoFalha: null,
    criadoEm: agora,
    criadoPor: null,
  };

  function montar(provedor: 'fake' | 'anthropic') {
    const repositorio = {
      versao: vi.fn().mockResolvedValue(linha),
      versaoAtiva: vi.fn().mockResolvedValue(2),
      pedirAvaliacao: vi.fn().mockResolvedValue(true),
      falharAvaliacao: vi.fn().mockResolvedValue(undefined),
      auditar: vi.fn().mockResolvedValue(undefined),
    };
    const config = {
      daVersao: vi.fn().mockResolvedValue({}),
      ativar: vi.fn().mockResolvedValue(undefined),
    };
    const fila = { add: vi.fn().mockResolvedValue({}) };
    const servico = new AdminMonyService(
      repositorio as unknown as AdminMonyRepository,
      config as unknown as ConfigMonyService,
      { provedorIa: provedor, modeloIa: 'claude' } as unknown as Configuracao,
      new ClockFixo(agora),
      fila as unknown as Queue<DadosJobAvaliacao>,
    );
    return { servico, repositorio, config, fila };
  }

  it('põe a avaliação na fila, uma tentativa, com o instante do pedido', async () => {
    const { servico, repositorio, fila } = montar('anthropic');
    await servico.avaliar('admin', 3, '10.0.0.1');
    expect(repositorio.pedirAvaliacao).toHaveBeenCalledWith(
      expect.objectContaining({ versao: 3, agora, livreAntesDe: antes(AVALIACAO_PARADA_MS) }),
    );
    expect(fila.add).toHaveBeenCalledWith(
      'avaliar',
      { versao: 3, pedidaEm: agora.toISOString() },
      { jobId: `avaliar-mony-3-${String(agora.getTime())}`, attempts: 1 },
    );
  });

  it('com o modelo falso ou outra avaliação rodando, recusa', async () => {
    const falso = montar('fake');
    await expect(falso.servico.avaliar('admin', 3, 'ip')).rejects.toThrow('modelo falso');
    expect(falso.fila.add).not.toHaveBeenCalled();

    const ocupada = montar('anthropic');
    ocupada.repositorio.pedirAvaliacao.mockResolvedValue(false);
    await expect(ocupada.servico.avaliar('admin', 3, 'ip')).rejects.toThrow('já está rodando');
    expect(ocupada.fila.add).not.toHaveBeenCalled();
  });

  it('fila fora do ar: o pedido vira falha e o erro sobe', async () => {
    const { servico, repositorio, fila } = montar('anthropic');
    fila.add.mockRejectedValue(new Error('sem Redis'));
    await expect(servico.avaliar('admin', 3, 'ip')).rejects.toThrow('sem Redis');
    expect(repositorio.falharAvaliacao).toHaveBeenCalledWith(
      3,
      agora,
      'A fila não aceitou o pedido.',
    );
  });

  it('ativar grava a auditoria com a versão anterior; a que já é ativa não faz nada', async () => {
    const { servico, repositorio, config } = montar('anthropic');
    await servico.ativar('admin', 3, 'ip');
    expect(config.ativar).toHaveBeenCalledWith(3);
    expect(repositorio.auditar).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'mony.versao_ativada',
        antes: { versaoAtiva: 2 },
        depois: { versaoAtiva: 3 },
      }),
    );

    const jaAtiva = montar('anthropic');
    jaAtiva.repositorio.versaoAtiva.mockResolvedValue(3);
    await jaAtiva.servico.ativar('admin', 3, 'ip');
    expect(jaAtiva.config.ativar).not.toHaveBeenCalled();
    expect(jaAtiva.repositorio.auditar).not.toHaveBeenCalled();
  });
});
