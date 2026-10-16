import { Injectable } from '@nestjs/common';
import {
  type AssinaturasAdmin,
  type ConsultaAssinaturasAdmin,
  DIAS_CONVERSAO_TESTE,
  type ResumoAssinaturasAdmin,
  SITUACOES_ASSINATURA_ADMIN,
} from '@mony/shared/admin';

import { Clock } from '../../core/clock/clock';
import { AdminAssinaturasRepository } from './admin-assinaturas.repository';
import { calcularMrr, situacaoDaAssinatura } from './dominio/assinaturas';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Assinaturas no painel (T-141b, doc 13): contas por situação, conversão do teste e MRR, e a lista
 * das contas de cada situação. Só leitura; para mudar uma conta, a página do usuário (T-141a).
 */
@Injectable()
export class AdminAssinaturasService {
  constructor(
    private readonly repositorio: AdminAssinaturasRepository,
    private readonly clock: Clock,
  ) {}

  async resumo(): Promise<ResumoAssinaturasAdmin> {
    const agora = this.clock.agora();
    const [contagens, grupos, cancelamentoAgendado, conversao] = await Promise.all([
      Promise.all(
        SITUACOES_ASSINATURA_ADMIN.map((situacao) => this.repositorio.contar(situacao, agora)),
      ),
      this.repositorio.gruposPagos(),
      this.repositorio.cancelamentosAgendados(agora),
      this.repositorio.conversaoTeste(
        new Date(agora.getTime() - DIAS_CONVERSAO_TESTE * DIA_MS),
        agora,
      ),
    ]);
    const situacoes = Object.fromEntries(
      SITUACOES_ASSINATURA_ADMIN.map((situacao, i) => [situacao, contagens[i] ?? 0]),
    ) as ResumoAssinaturasAdmin['situacoes'];
    const mrr = calcularMrr(grupos);
    const pagasPorPlano = { mensal: 0, anual: 0 };
    for (const grupo of grupos) pagasPorPlano[grupo.plano] += grupo.quantidade;
    return {
      situacoes,
      pagasPorPlano,
      cancelamentoAgendado,
      mrrCentavos: mrr.ativa,
      mrrInadimplenteCentavos: mrr.inadimplente,
      conversaoTeste: { dias: DIAS_CONVERSAO_TESTE, ...conversao },
    };
  }

  async listar(consulta: ConsultaAssinaturasAdmin): Promise<AssinaturasAdmin> {
    const agora = this.clock.agora();
    const linhas = await this.repositorio.listar({
      situacao: consulta.situacao,
      ...(consulta.cursor ? { cursor: consulta.cursor } : {}),
      limite: consulta.limite + 1,
      agora,
    });
    const pagina = linhas.slice(0, consulta.limite);
    return {
      itens: pagina.map((linha) => {
        const assinatura = linha.assinatura;
        return {
          usuarioId: linha.id,
          nome: linha.nome,
          email: linha.email,
          situacao: situacaoDaAssinatura(assinatura, agora),
          plano: assinatura?.plano ?? null,
          valorCentavos: assinatura?.planoPreco ? Number(assinatura.planoPreco.valor) : null,
          testeFim: assinatura?.testeFim?.toISOString() ?? null,
          proximaCobranca: assinatura?.proximaCobranca?.toISOString() ?? null,
          cancelamentoAgendado: assinatura?.cancelamentoAgendado ?? false,
          canceladaEm: assinatura?.canceladaEm?.toISOString() ?? null,
        };
      }),
      proximoCursor: linhas.length > consulta.limite ? (pagina.at(-1)?.id ?? null) : null,
    };
  }
}
