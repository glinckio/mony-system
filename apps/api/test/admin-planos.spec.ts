import type { PlanoGratuitoAdmin } from '@mony/shared/admin';
import { describe, expect, it, vi } from 'vitest';

import { ClockFixo } from '../src/core/clock/clock';
import type { CobrancaProvider } from '../src/integracoes/cobranca/cobranca.provider';
import type { AdminPlanosRepository } from '../src/modulos/admin/admin-planos.repository';
import { AdminPlanosService } from '../src/modulos/admin/admin-planos.service';

const PADRAO: PlanoGratuitoAdmin = {
  duracaoTesteDias: 3,
  limitesDeUso: [
    { recurso: 'lancamento', limiteDia: 3, limiteMes: 30 },
    { recurso: 'mensagem_mony', limiteDia: 10, limiteMes: null },
    { recurso: 'leitura_documento', limiteDia: null, limiteMes: 3 },
  ],
  limitesDeQuantidade: [
    { recurso: 'cartao', limiteQuantidade: 1 },
    { recurso: 'lista_compras', limiteQuantidade: 1 },
    { recurso: 'lembrete_ativo', limiteQuantidade: 5 },
  ],
};

function servico(atual: PlanoGratuitoAdmin) {
  let gravado = atual;
  const salvar = vi.fn((novo: { dados: PlanoGratuitoAdmin }) => {
    gravado = novo.dados;
    return Promise.resolve();
  });
  const repositorio = {
    planoGratuito: () => Promise.resolve(gravado),
    salvarPlanoGratuito: salvar,
  } as unknown as AdminPlanosRepository;
  return {
    servico: new AdminPlanosService(
      repositorio,
      {} as CobrancaProvider,
      new ClockFixo('2026-10-15T15:00:00Z'),
    ),
    salvar,
  };
}

describe('plano gratuito no painel (T-104c)', () => {
  it('RN-120 grava os limites e a duração do teste com o antes para a auditoria', async () => {
    const { servico: planos, salvar } = servico(PADRAO);
    const novo: PlanoGratuitoAdmin = {
      ...PADRAO,
      duracaoTesteDias: 7,
      limitesDeUso: [
        { recurso: 'lancamento', limiteDia: 5, limiteMes: 50 },
        ...PADRAO.limitesDeUso.slice(1),
      ],
    };
    expect(await planos.salvarPlanoGratuito('admin-1', novo, '10.0.0.1')).toEqual(novo);
    expect(salvar).toHaveBeenCalledWith({
      dados: novo,
      antes: PADRAO,
      adminId: 'admin-1',
      ip: '10.0.0.1',
    });
  });

  it('os mesmos valores, mesmo em outra ordem, não gravam nem auditam', async () => {
    const { servico: planos, salvar } = servico(PADRAO);
    const reordenado: PlanoGratuitoAdmin = {
      ...PADRAO,
      limitesDeUso: [...PADRAO.limitesDeUso].reverse(),
      limitesDeQuantidade: [...PADRAO.limitesDeQuantidade].reverse(),
    };
    expect(await planos.salvarPlanoGratuito('admin-1', reordenado, '10.0.0.1')).toEqual(PADRAO);
    expect(salvar).not.toHaveBeenCalled();
  });
});
