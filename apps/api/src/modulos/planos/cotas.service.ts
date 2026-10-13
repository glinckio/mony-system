import { Injectable } from '@nestjs/common';
import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import type { Plano } from '@mony/shared/enums';
import type { LimiteUso, UsoPlano } from '@mony/shared/planos';
import { periodoNoGratuito } from '@mony/shared/relatorios';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { type BancoCotas, CotasRepository } from './cotas.repository';
import {
  contaNaCota,
  ehLimitado,
  erroDeLimite,
  janelaDoMes,
  limiteEstourado,
  planoEfetivo,
  type RecursoDeQuantidade,
  type RecursoDeUso,
  renovaEm,
} from './dominio/cotas';

/** Os recursos que o app já tem, na ordem de `GET /assinatura/uso`. */
const RECURSOS_DE_USO: readonly RecursoDeUso[] = [
  'lancamento',
  'mensagem_mony',
  'leitura_documento',
];
const RECURSOS_DE_QUANTIDADE: readonly RecursoDeQuantidade[] = ['cartao'];

/**
 * Cotas do plano gratuito (RN-120 a RN-123). A conta é feita no Service que grava, dentro da
 * transação dele: o lançamento manual e o da Mony passam pelo mesmo Service, e o que não foi
 * gravado não conta. Só o gratuito tem limite; o teste e os pagos liberam tudo.
 */
@Injectable()
export class CotasService {
  constructor(
    private readonly repositorio: CotasRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * RN-122: conta `quantidade` usos de hoje no fuso do usuário, ou lança `LIMITE_PLANO_ATINGIDO`
   * se passaria do limite do dia ou do mês. Com `tx`, na transação de quem grava (e o erro desfaz
   * a gravação); sem ela, numa transação própria.
   */
  async consumir(
    contexto: Contexto,
    recurso: RecursoDeUso,
    tx?: BancoCotas,
    quantidade = 1,
  ): Promise<void> {
    if (!contaNaCota(contexto.origem)) return;
    const usuarioId = usuarioDoContexto(contexto);
    const contar = async (db: BancoCotas): Promise<void> => {
      const cota = await this.cotaDeUso(db, usuarioId, recurso);
      if (cota === null) return;
      await this.repositorio.travar(db, usuarioId, recurso);
      await this.conferirUso(db, usuarioId, recurso, cota, quantidade);
      await this.repositorio.somar(db, usuarioId, recurso, cota.hoje, quantidade);
    };
    await (tx ? contar(tx) : this.repositorio.emTransacao(contar));
  }

  /**
   * Confere, sem contar, se ainda cabe mais um uso hoje: a Mony avisa antes de fazer as perguntas
   * de um lançamento que não daria para gravar (RN-123). Quem grava conta com `consumir`.
   */
  async conferir(contexto: Contexto, recurso: RecursoDeUso): Promise<void> {
    if (!contaNaCota(contexto.origem)) return;
    const usuarioId = usuarioDoContexto(contexto);
    const db = this.repositorio.banco;
    const cota = await this.cotaDeUso(db, usuarioId, recurso);
    if (cota !== null) await this.conferirUso(db, usuarioId, recurso, cota, 1);
  }

  /**
   * RN-120 e RN-127: os limites de quantidade contam os itens que existem. Os que já passam do
   * limite (de quando o plano era outro) continuam visíveis e editáveis; só não dá para criar
   * outro. Na transação de quem cria.
   */
  async conferirQuantidade(
    contexto: Contexto,
    recurso: RecursoDeQuantidade,
    tx: BancoCotas,
  ): Promise<void> {
    if (!contaNaCota(contexto.origem)) return;
    const usuarioId = usuarioDoContexto(contexto);
    const { assinatura } = await this.repositorio.situacao(tx, usuarioId);
    if (!ehLimitado(planoEfetivo(assinatura, this.clock.agora()))) return;
    const limite = (await this.repositorio.limites(tx, recurso))?.limiteQuantidade ?? null;
    if (limite === null) return;
    await this.repositorio.travar(tx, usuarioId, recurso);
    if ((await this.repositorio.contarItens(tx, usuarioId, recurso)) >= limite) {
      throw erroDeLimite({ recurso, periodo: 'quantidade', limite, renovaEm: null });
    }
  }

  /**
   * RN-120: no gratuito, a tela de relatórios mostra só o mês atual. Devolve o período dentro do
   * mês de hoje, ou lança `LIMITE_PLANO_ATINGIDO` se o pedido não tem nenhum dia nele. As consultas
   * da Mony e os resumos das rotinas não são a tela de relatórios e não mudam.
   */
  async periodoDoRelatorio(
    contexto: Contexto,
    periodo: { inicio: DataCalendario; fim: DataCalendario },
  ): Promise<{ inicio: DataCalendario; fim: DataCalendario }> {
    if (contexto.origem !== 'app') return periodo;
    const usuarioId = usuarioDoContexto(contexto);
    const agora = this.clock.agora();
    const { fuso, assinatura } = await this.repositorio.situacao(this.repositorio.banco, usuarioId);
    if (!ehLimitado(planoEfetivo(assinatura, agora))) return periodo;
    const dentro = periodoNoGratuito(periodo, dataNoFuso(agora, fuso));
    if (dentro === null) {
      throw erroDeLimite({ recurso: 'relatorio', periodo: 'mes', limite: 1, renovaEm: null });
    }
    return dentro;
  }

  /** RN-120 e RN-151: no gratuito, os relatórios não são exportados. */
  async conferirExportacao(contexto: Contexto): Promise<void> {
    if (!contaNaCota(contexto.origem)) return;
    const usuarioId = usuarioDoContexto(contexto);
    const { assinatura } = await this.repositorio.situacao(this.repositorio.banco, usuarioId);
    if (!ehLimitado(planoEfetivo(assinatura, this.clock.agora()))) return;
    throw new ErroDominio('LIMITE_PLANO_ATINGIDO', {
      mensagem: 'No plano gratuito, os relatórios não são exportados.',
      detalhes: { recurso: 'relatorio', periodo: 'quantidade', limite: 0, renovaEm: null },
    });
  }

  /** `GET /assinatura/uso`: o plano que vale agora e, no gratuito, quanto já foi usado. */
  async uso(contexto: Contexto): Promise<UsoPlano> {
    const usuarioId = usuarioDoContexto(contexto);
    const agora = this.clock.agora();
    const db = this.repositorio.banco;
    const { fuso, assinatura } = await this.repositorio.situacao(db, usuarioId);
    const plano: Plano = planoEfetivo(assinatura, agora);
    const testeFim = plano === 'teste' ? (assinatura?.testeFim?.toISOString() ?? null) : null;
    if (!ehLimitado(plano)) return { plano, limitado: false, testeFim, limites: [] };

    const hoje = dataNoFuso(agora, fuso);
    const mes = janelaDoMes(hoje);
    const todos = await this.repositorio.todosOsLimites();
    const limites: LimiteUso[] = [];
    for (const recurso of RECURSOS_DE_USO) {
      const limite = todos.get(recurso);
      if (!limite || (limite.limiteDia === null && limite.limiteMes === null)) continue;
      const uso = await this.repositorio.uso(db, usuarioId, recurso, mes.inicio, hoje);
      if (limite.limiteDia !== null) {
        limites.push({
          recurso,
          periodo: 'dia',
          uso: uso.dia,
          limite: limite.limiteDia,
          renovaEm: renovaEm(hoje, 'dia', fuso).toISOString(),
        });
      }
      if (limite.limiteMes !== null) {
        limites.push({
          recurso,
          periodo: 'mes',
          uso: uso.mes,
          limite: limite.limiteMes,
          renovaEm: renovaEm(hoje, 'mes', fuso).toISOString(),
        });
      }
    }
    for (const recurso of RECURSOS_DE_QUANTIDADE) {
      const limite = todos.get(recurso)?.limiteQuantidade ?? null;
      if (limite === null) continue;
      const uso = await this.repositorio.contarItens(db, usuarioId, recurso);
      limites.push({ recurso, periodo: 'quantidade', uso, limite, renovaEm: null });
    }
    return { plano, limitado: true, testeFim: null, limites };
  }

  /** O que a conta precisa, ou `null` se o recurso não tem limite para o usuário agora. */
  private async cotaDeUso(
    db: BancoCotas,
    usuarioId: string,
    recurso: RecursoDeUso,
  ): Promise<{
    hoje: DataCalendario;
    fuso: string;
    limiteDia: number | null;
    limiteMes: number | null;
  } | null> {
    const agora = this.clock.agora();
    const { fuso, assinatura } = await this.repositorio.situacao(db, usuarioId);
    if (!ehLimitado(planoEfetivo(assinatura, agora))) return null;
    const limites = await this.repositorio.limites(db, recurso);
    if (!limites || (limites.limiteDia === null && limites.limiteMes === null)) return null;
    return {
      hoje: dataNoFuso(agora, fuso),
      fuso,
      limiteDia: limites.limiteDia,
      limiteMes: limites.limiteMes,
    };
  }

  private async conferirUso(
    db: BancoCotas,
    usuarioId: string,
    recurso: RecursoDeUso,
    cota: {
      hoje: DataCalendario;
      fuso: string;
      limiteDia: number | null;
      limiteMes: number | null;
    },
    quantidade: number,
  ): Promise<void> {
    const mes = janelaDoMes(cota.hoje);
    const uso = await this.repositorio.uso(db, usuarioId, recurso, mes.inicio, cota.hoje);
    const estourado = limiteEstourado(
      { limiteDia: cota.limiteDia, limiteMes: cota.limiteMes, limiteQuantidade: null },
      uso,
      quantidade,
    );
    if (estourado) {
      throw erroDeLimite({
        recurso,
        periodo: estourado.periodo,
        limite: estourado.limite,
        renovaEm: renovaEm(cota.hoje, estourado.periodo, cota.fuso).toISOString(),
      });
    }
  }
}
