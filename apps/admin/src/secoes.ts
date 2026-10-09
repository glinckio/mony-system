import {
  Bot,
  ChartLine,
  CreditCard,
  Layers,
  type LucideIcon,
  Megaphone,
  ScrollText,
  Settings,
  Tags,
  Users,
} from 'lucide-react';

/** Seções do painel (docs/arquitetura/13), na ordem do menu. */
export const SECOES = [
  'usuarios',
  'assinaturas',
  'planos',
  'novidades',
  'mony',
  'metricas',
  'auditoria',
  'filas',
  'configuracoes',
] as const;

export type Secao = (typeof SECOES)[number];

export const ICONES_SECOES: Record<Secao, LucideIcon> = {
  usuarios: Users,
  assinaturas: CreditCard,
  planos: Tags,
  novidades: Megaphone,
  mony: Bot,
  metricas: ChartLine,
  auditoria: ScrollText,
  filas: Layers,
  configuracoes: Settings,
};
