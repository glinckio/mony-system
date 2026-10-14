import { Injectable } from '@nestjs/common';
import type { DataCalendario } from '@mony/shared/datas';
import type { Plano, RecursoPlano, StatusAssinatura } from '@mony/shared/enums';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';
import type {
  LimitesDoRecurso,
  RecursoDeQuantidade,
  RecursoDeUso,
  SituacaoAssinatura,
} from './dominio/cotas';

/**
 * O que a cota usa do banco: só SQL, para caber na transação de quem grava (a transação de cada
 * módulo expõe `$queryRaw`).
 */
export type BancoCotas = Pick<ClientePrisma, '$queryRaw'>;

/** As colunas de `limites_plano`. */
interface LinhaLimite {
  recurso: RecursoPlano;
  limite_dia: number | null;
  limite_mes: number | null;
  limite_quantidade: number | null;
}

const paraLimites = (linha: LinhaLimite): LimitesDoRecurso => ({
  limiteDia: linha.limite_dia,
  limiteMes: linha.limite_mes,
  limiteQuantidade: linha.limite_quantidade,
});

/** Contagem e trava das cotas do gratuito (RN-120, RN-122), em `uso_recursos`. */
@Injectable()
export class CotasRepository {
  constructor(private readonly prisma: PrismaService) {}

  get banco(): BancoCotas {
    return this.prisma.cliente;
  }

  emTransacao<T>(operacao: (tx: BancoCotas) => Promise<T>): Promise<T> {
    return this.prisma.cliente.$transaction((tx) => operacao(tx));
  }

  /** O fuso do usuário e a assinatura dele (sem assinatura, `null`). */
  async situacao(
    db: BancoCotas,
    usuarioId: string,
  ): Promise<{ fuso: string; assinatura: SituacaoAssinatura | null }> {
    const [linha] = await db.$queryRaw<
      {
        fuso: string;
        plano: Plano | null;
        status: StatusAssinatura | null;
        teste_fim: Date | null;
      }[]
    >`
      SELECT u.fuso_horario AS fuso, a.plano::text AS plano, a.status::text AS status, a.teste_fim
      FROM usuarios u
      LEFT JOIN assinaturas a ON a.usuario_id = u.id
      WHERE u.id = ${usuarioId}::uuid`;
    if (!linha) throw new Error(`Usuário ${usuarioId} não encontrado`);
    return {
      fuso: linha.fuso,
      assinatura:
        linha.plano === null || linha.status === null
          ? null
          : { plano: linha.plano, status: linha.status, testeFim: linha.teste_fim },
    };
  }

  async limites(db: BancoCotas, recurso: RecursoPlano): Promise<LimitesDoRecurso | null> {
    const [linha] = await db.$queryRaw<LinhaLimite[]>`
      SELECT recurso::text AS recurso, limite_dia, limite_mes, limite_quantidade
      FROM limites_plano
      WHERE recurso = ${recurso}::recurso_plano`;
    return linha ? paraLimites(linha) : null;
  }

  async todosOsLimites(): Promise<Map<RecursoPlano, LimitesDoRecurso>> {
    const linhas = await this.banco.$queryRaw<LinhaLimite[]>`
      SELECT recurso::text AS recurso, limite_dia, limite_mes, limite_quantidade
      FROM limites_plano`;
    return new Map(linhas.map((linha) => [linha.recurso, paraLimites(linha)]));
  }

  /**
   * Trava a cota do usuário naquele recurso até o fim da transação: duas gravações ao mesmo tempo
   * conferem uma depois da outra (RN-122). A trava não mexe em linha nenhuma.
   */
  async travar(db: BancoCotas, usuarioId: string, recurso: RecursoPlano): Promise<void> {
    await db.$queryRaw`
      SELECT 1 AS travado
      FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`cota:${usuarioId}:${recurso}`}, 0))) t`;
  }

  /** O uso de `hoje` e do mês (de `inicioMes` a `hoje`). */
  async uso(
    db: BancoCotas,
    usuarioId: string,
    recurso: RecursoDeUso,
    inicioMes: DataCalendario,
    hoje: DataCalendario,
  ): Promise<{ dia: number; mes: number }> {
    const [linha] = await db.$queryRaw<{ dia: number; mes: number }[]>`
      SELECT
        COALESCE(SUM(quantidade) FILTER (WHERE data = ${hoje}::date), 0)::int AS dia,
        COALESCE(SUM(quantidade), 0)::int AS mes
      FROM uso_recursos
      WHERE usuario_id = ${usuarioId}::uuid
        AND recurso = ${recurso}::recurso_plano
        AND data BETWEEN ${inicioMes}::date AND ${hoje}::date`;
    return { dia: linha?.dia ?? 0, mes: linha?.mes ?? 0 };
  }

  /** Soma `quantidade` ao uso do dia (uma linha por usuário, recurso e dia). */
  async somar(
    db: BancoCotas,
    usuarioId: string,
    recurso: RecursoDeUso,
    hoje: DataCalendario,
    quantidade: number,
  ): Promise<void> {
    await db.$queryRaw`
      INSERT INTO uso_recursos (id, usuario_id, recurso, data, quantidade, atualizado_em)
      VALUES (gen_random_uuid(), ${usuarioId}::uuid, ${recurso}::recurso_plano, ${hoje}::date,
        ${quantidade}, now())
      ON CONFLICT (usuario_id, recurso, data)
      DO UPDATE SET quantidade = uso_recursos.quantidade + EXCLUDED.quantidade,
        atualizado_em = now()
      RETURNING quantidade`;
  }

  /**
   * Os itens que contam no limite de quantidade (RN-120): os cartões não excluídos, as listas de
   * compras abertas (a finalizada é histórico) e os lembretes ativos (o que tocou e espera o [Feito]
   * também).
   */
  async contarItens(
    db: BancoCotas,
    usuarioId: string,
    recurso: RecursoDeQuantidade,
  ): Promise<number> {
    const consultas: Record<RecursoDeQuantidade, () => Promise<{ total: number }[]>> = {
      cartao: () => db.$queryRaw`
        SELECT COUNT(*)::int AS total
        FROM cartoes
        WHERE usuario_id = ${usuarioId}::uuid AND excluido_em IS NULL`,
      lista_compras: () => db.$queryRaw`
        SELECT COUNT(*)::int AS total
        FROM listas_compras
        WHERE usuario_id = ${usuarioId}::uuid AND finalizada_em IS NULL`,
      lembrete_ativo: () => db.$queryRaw`
        SELECT COUNT(*)::int AS total
        FROM lembretes
        WHERE usuario_id = ${usuarioId}::uuid AND status = 'ativo'`,
    };
    const [linha] = await consultas[recurso]();
    return linha?.total ?? 0;
  }
}
