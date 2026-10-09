import {
  type RecursoPlano,
  type TipoAlerta,
  type TipoCategoria,
  TIPOS_ALERTA,
} from '@mony/shared/enums';

import type { ClientePrisma } from '../prisma/cliente';

interface CategoriaPadrao {
  nome: string;
  tipo: TipoCategoria;
  /** Cor provisória; os tokens definitivos vêm do design do cliente (T-011). */
  cor: string;
  /** Chave do ícone; o app mapeia para o ícone do design system. */
  icone: string;
}

/**
 * Categorias criadas no cadastro (RN-006, RN-065). Lista sugerida no doc 06,
 * **a confirmar com o cliente**.
 */
export const CATEGORIAS_PADRAO: readonly CategoriaPadrao[] = [
  { nome: 'Alimentação', tipo: 'despesa', cor: '#F97316', icone: 'alimentacao' },
  { nome: 'Mercado', tipo: 'despesa', cor: '#22C55E', icone: 'mercado' },
  { nome: 'Transporte', tipo: 'despesa', cor: '#3B82F6', icone: 'transporte' },
  { nome: 'Moradia', tipo: 'despesa', cor: '#8B5CF6', icone: 'moradia' },
  { nome: 'Saúde', tipo: 'despesa', cor: '#EF4444', icone: 'saude' },
  { nome: 'Educação', tipo: 'despesa', cor: '#0EA5E9', icone: 'educacao' },
  { nome: 'Lazer', tipo: 'despesa', cor: '#EC4899', icone: 'lazer' },
  { nome: 'Compras', tipo: 'despesa', cor: '#F59E0B', icone: 'compras' },
  { nome: 'Assinaturas', tipo: 'despesa', cor: '#6366F1', icone: 'assinaturas' },
  { nome: 'Contas', tipo: 'despesa', cor: '#64748B', icone: 'contas' },
  { nome: 'Outros', tipo: 'despesa', cor: '#94A3B8', icone: 'outros' },
  { nome: 'Salário', tipo: 'receita', cor: '#16A34A', icone: 'salario' },
  { nome: 'Freelance', tipo: 'receita', cor: '#14B8A6', icone: 'freelance' },
  { nome: 'Rendimentos', tipo: 'receita', cor: '#84CC16', icone: 'rendimentos' },
  { nome: 'Outros', tipo: 'receita', cor: '#94A3B8', icone: 'outros' },
];

/**
 * Apps de compra sugeridos na detecção (doc 06). No Android o identificador é o pacote do app;
 * no iOS o usuário escolhe pelo Screen Time (T-021).
 */
export const APPS_COMPRA_SUGERIDOS: readonly { identificadorApp: string; nome: string }[] = [
  { identificadorApp: 'com.shopee.br', nome: 'Shopee' },
  { identificadorApp: 'com.mercadolibre', nome: 'Mercado Livre' },
  { identificadorApp: 'com.amazon.mShop.android.shopping', nome: 'Amazon' },
  { identificadorApp: 'com.zzkko', nome: 'Shein' },
  { identificadorApp: 'com.alibaba.aliexpresshd', nome: 'AliExpress' },
  { identificadorApp: 'com.luizalabs.mlapp', nome: 'Magalu' },
  { identificadorApp: 'br.com.brainweb.ifood', nome: 'iFood' },
];

interface LimitePadrao {
  recurso: RecursoPlano;
  limiteDia: number | null;
  limiteMes: number | null;
  limiteQuantidade: number | null;
}

/**
 * Limites do plano gratuito (RN-120), padrões editáveis no admin. `relatorio` não tem número:
 * a regra (só mês atual, sem exportação) fica no código.
 */
export const LIMITES_PLANO_PADRAO: readonly LimitePadrao[] = [
  { recurso: 'lancamento', limiteDia: 3, limiteMes: 30, limiteQuantidade: null },
  { recurso: 'mensagem_mony', limiteDia: 10, limiteMes: null, limiteQuantidade: null },
  { recurso: 'leitura_documento', limiteDia: null, limiteMes: 3, limiteQuantidade: null },
  { recurso: 'cartao', limiteDia: null, limiteMes: null, limiteQuantidade: 1 },
  { recurso: 'lista_compras', limiteDia: null, limiteMes: null, limiteQuantidade: 1 },
  { recurso: 'lembrete_ativo', limiteDia: null, limiteMes: null, limiteQuantidade: 5 },
  { recurso: 'relatorio', limiteDia: null, limiteMes: null, limiteQuantidade: null },
];

/** Antecedência padrão dos avisos de vencimento: 3 dias (RN-108). */
const ANTECEDENCIA_PADRAO_DIAS: Partial<Record<TipoAlerta, number>> = {
  fatura_vencimento: 3,
  vencimento_pendente: 3,
};

type ClienteParaPadroes = Pick<ClientePrisma, 'categoria' | 'preferenciaAlerta' | 'appMonitorado'>;

/**
 * Cria os dados padrão de um usuário novo: categorias (só se ele ainda não tiver nenhuma),
 * preferências de alerta com todos os tipos ligados (RN-006) e os apps de compra sugeridos.
 * Pode rodar de novo sem duplicar. Aceita o cliente ou uma transação do Prisma.
 */
export async function aplicarPadroesDoUsuario(
  prisma: ClienteParaPadroes,
  usuarioId: string,
): Promise<void> {
  const categoriasExistentes = await prisma.categoria.count({ where: { usuarioId } });
  if (categoriasExistentes === 0) {
    await prisma.categoria.createMany({
      data: CATEGORIAS_PADRAO.map((categoria) => ({ ...categoria, usuarioId, padrao: true })),
    });
  }
  await prisma.preferenciaAlerta.createMany({
    data: TIPOS_ALERTA.map((tipoAlerta) => ({
      usuarioId,
      tipoAlerta,
      ativo: true,
      antecedenciaDias: ANTECEDENCIA_PADRAO_DIAS[tipoAlerta] ?? null,
    })),
    skipDuplicates: true,
  });
  await prisma.appMonitorado.createMany({
    data: APPS_COMPRA_SUGERIDOS.map((app) => ({ ...app, usuarioId, ativo: true })),
    skipDuplicates: true,
  });
}
