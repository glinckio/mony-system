import * as compartilhados from '@mony/shared/enums';
import { describe, expect, it, vi } from 'vitest';

import {
  APPS_COMPRA_SUGERIDOS,
  aplicarPadroesDoUsuario,
  CATEGORIAS_PADRAO,
  LIMITES_PLANO_PADRAO,
} from '../src/core/dados-iniciais/padroes';
import { comFiltroDeExclusao } from '../src/core/prisma/exclusao-logica';
import * as doBanco from '../src/generated/prisma/enums';

/** Cada enum do Postgres e a lista correspondente em @mony/shared/enums. */
const PARES: [keyof typeof doBanco, readonly string[]][] = [
  ['PapelUsuario', compartilhados.PAPEIS_USUARIO],
  ['StatusUsuario', compartilhados.STATUS_USUARIO],
  ['ProvedorLoginSocial', compartilhados.PROVEDORES_LOGIN_SOCIAL],
  ['PlataformaDispositivo', compartilhados.PLATAFORMAS_DISPOSITIVO],
  ['Plano', compartilhados.PLANOS],
  ['PlanoPago', compartilhados.PLANOS_PAGOS],
  ['StatusAssinatura', compartilhados.STATUS_ASSINATURA],
  ['RecursoPlano', compartilhados.RECURSOS_PLANO],
  ['TipoCategoria', compartilhados.TIPOS_CATEGORIA],
  ['TipoTransacao', compartilhados.TIPOS_TRANSACAO],
  ['TipoConta', compartilhados.TIPOS_CONTA],
  ['OrigemConta', compartilhados.ORIGENS_CONTA],
  ['StatusFatura', compartilhados.STATUS_FATURA],
  ['StatusTransacao', compartilhados.STATUS_TRANSACAO],
  ['FormaPagamento', compartilhados.FORMAS_PAGAMENTO],
  ['OrigemTransacao', compartilhados.ORIGENS_TRANSACAO],
  ['NaturezaTransacao', compartilhados.NATUREZAS_TRANSACAO],
  ['FrequenciaRecorrencia', compartilhados.FREQUENCIAS_RECORRENCIA],
  ['TipoParcelamento', compartilhados.TIPOS_PARCELAMENTO],
  ['StatusParcelamento', compartilhados.STATUS_PARCELAMENTO],
  ['StatusParcela', compartilhados.STATUS_PARCELA],
  ['TipoAnexo', compartilhados.TIPOS_ANEXO],
  ['CategoriaLista', compartilhados.CATEGORIAS_LISTA],
  ['RecursoCompartilhavel', compartilhados.RECURSOS_COMPARTILHAVEIS],
  ['PermissaoCompartilhamento', compartilhados.PERMISSOES_COMPARTILHAMENTO],
  ['StatusConvite', compartilhados.STATUS_CONVITE],
  ['CanalLembrete', compartilhados.CANAIS_LEMBRETE],
  ['StatusLembrete', compartilhados.STATUS_LEMBRETE],
  ['ProvedorAgenda', compartilhados.PROVEDORES_AGENDA],
  ['OrigemCompromisso', compartilhados.ORIGENS_COMPROMISSO],
  ['TipoAlerta', compartilhados.TIPOS_ALERTA],
  ['StatusConexaoOpenFinance', compartilhados.STATUS_CONEXAO_OPEN_FINANCE],
  ['AutorMensagem', compartilhados.AUTORES_MENSAGEM],
  ['TipoMensagem', compartilhados.TIPOS_MENSAGEM],
  ['TipoImportacao', compartilhados.TIPOS_IMPORTACAO],
  ['StatusImportacao', compartilhados.STATUS_IMPORTACAO],
  ['StatusNovidade', compartilhados.STATUS_NOVIDADE],
  ['ProvedorWebhook', compartilhados.PROVEDORES_WEBHOOK],
  ['DocumentoAceite', compartilhados.DOCUMENTOS_ACEITE],
  ['FinalidadeConsentimento', compartilhados.FINALIDADES_CONSENTIMENTO],
  ['TipoControleTeste', compartilhados.TIPOS_CONTROLE_TESTE],
];

describe('enums do banco', () => {
  it.each(PARES)('%s tem os mesmos valores de @mony/shared/enums', (nome, lista) => {
    expect(Object.values(doBanco[nome])).toEqual(lista);
  });

  it('todo enum do schema está na comparação', () => {
    expect(Object.keys(doBanco).sort()).toEqual(PARES.map(([nome]) => nome).sort());
  });
});

describe('exclusão lógica', () => {
  it('filtra os excluídos nas leituras de transações, cartões, parcelamentos e categorias', () => {
    for (const modelo of ['Transacao', 'Cartao', 'Parcelamento', 'Categoria']) {
      expect(comFiltroDeExclusao(modelo, 'findMany', { where: { usuarioId: 'u1' } })).toEqual({
        where: { usuarioId: 'u1', excluidoEm: null },
      });
    }
    expect(comFiltroDeExclusao('Transacao', 'count', undefined)).toEqual({
      where: { excluidoEm: null },
    });
    expect(comFiltroDeExclusao('Cartao', 'findUnique', { where: { id: 'c1' } })).toEqual({
      where: { id: 'c1', excluidoEm: null },
    });
  });

  it('respeita quem pede os excluídos explicitamente', () => {
    const args = { where: { usuarioId: 'u1', excluidoEm: { not: null } } };
    expect(comFiltroDeExclusao('Transacao', 'findMany', args)).toBe(args);
  });

  it('não mexe em escrita nem em modelos sem exclusão lógica', () => {
    const args = { where: { id: 't1' }, data: { descricao: 'x' } };
    expect(comFiltroDeExclusao('Transacao', 'update', args)).toBe(args);
    expect(comFiltroDeExclusao('Usuario', 'findMany', args)).toBe(args);
  });
});

describe('dados padrão', () => {
  it('categorias padrão têm nome único por tipo e despesas e receitas', () => {
    for (const tipo of compartilhados.TIPOS_CATEGORIA) {
      const nomes = CATEGORIAS_PADRAO.filter((categoria) => categoria.tipo === tipo).map(
        (categoria) => categoria.nome,
      );
      expect(nomes.length).toBeGreaterThan(0);
      expect(new Set(nomes).size).toBe(nomes.length);
    }
  });

  it('RN-120 limites do plano gratuito', () => {
    expect(LIMITES_PLANO_PADRAO.map((limite) => limite.recurso)).toEqual(
      compartilhados.RECURSOS_PLANO,
    );
    const porRecurso = Object.fromEntries(
      LIMITES_PLANO_PADRAO.map((limite) => [limite.recurso, limite]),
    );
    expect(porRecurso.lancamento).toMatchObject({ limiteDia: 3, limiteMes: 30 });
    expect(porRecurso.mensagem_mony).toMatchObject({ limiteDia: 10 });
    expect(porRecurso.leitura_documento).toMatchObject({ limiteMes: 3 });
    expect(porRecurso.cartao).toMatchObject({ limiteQuantidade: 1 });
    expect(porRecurso.lista_compras).toMatchObject({ limiteQuantidade: 1 });
    expect(porRecurso.lembrete_ativo).toMatchObject({ limiteQuantidade: 5 });
  });

  it('apps sugeridos não se repetem', () => {
    const ids = APPS_COMPRA_SUGERIDOS.map((app) => app.identificadorApp);
    expect(new Set(ids).size).toBe(ids.length);
  });

  function clienteFalso(categoriasExistentes: number) {
    return {
      categoria: {
        count: vi.fn().mockResolvedValue(categoriasExistentes),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      preferenciaAlerta: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      appMonitorado: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
  }

  it('RN-006 cadastro cria categorias padrão e todas as preferências de alerta ligadas', async () => {
    const prisma = clienteFalso(0);
    await aplicarPadroesDoUsuario(prisma as never, 'u1');
    expect(prisma.categoria.createMany).toHaveBeenCalledWith({
      data: CATEGORIAS_PADRAO.map((categoria) => ({ ...categoria, usuarioId: 'u1', padrao: true })),
    });
    expect(prisma.preferenciaAlerta.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    const [{ data: preferencias }] = prisma.preferenciaAlerta.createMany.mock.calls[0] as [
      { data: { tipoAlerta: string; ativo: boolean; antecedenciaDias: number | null }[] },
    ];
    expect(preferencias.map((preferencia) => preferencia.tipoAlerta)).toEqual(
      compartilhados.TIPOS_ALERTA,
    );
    expect(preferencias.every((preferencia) => preferencia.ativo)).toBe(true);
    expect(preferencias.find((p) => p.tipoAlerta === 'fatura_vencimento')?.antecedenciaDias).toBe(
      3,
    );
    expect(prisma.appMonitorado.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('não duplica categorias de quem já tem', async () => {
    const prisma = clienteFalso(15);
    await aplicarPadroesDoUsuario(prisma as never, 'u1');
    expect(prisma.categoria.createMany).not.toHaveBeenCalled();
  });
});
