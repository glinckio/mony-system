import { Injectable } from '@nestjs/common';
import { esquemaPrecosIaAdmin } from '@mony/shared/admin';

import { PrismaService } from '../../core/prisma/prisma.service';
import { CONFIGURACAO_PRECOS_IA } from '../admin/admin-mony.repository';
import { custoDoModelo } from '../admin/dominio/mony';

/** O que a rotina de alertas técnicos lê do banco (T-142a). */
@Injectable()
export class MonitoramentoRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Custo das chamadas ao modelo em `[desde, ate)`, pela tabela de preços do painel (T-141e), em
   * centavos de dólar. Modelos sem preço ficam fora da soma e voltam em `modelosSemPreco`.
   */
  async custoIa(desde: Date, ate: Date): Promise<{ centavos: number; modelosSemPreco: string[] }> {
    const [grupos, linhaPrecos] = await Promise.all([
      this.prisma.cliente.logIa.groupBy({
        by: ['modelo'],
        where: { criadoEm: { gte: desde, lt: ate } },
        _sum: { tokensEntrada: true, tokensSaida: true },
        orderBy: { modelo: 'asc' },
      }),
      this.prisma.cliente.configuracao.findUnique({
        where: { chave: CONFIGURACAO_PRECOS_IA },
        select: { valor: true },
      }),
    ]);
    const lidos = esquemaPrecosIaAdmin.shape.precos.safeParse(linhaPrecos?.valor);
    const precos = lidos.success ? lidos.data : [];
    let centavos = 0;
    const modelosSemPreco: string[] = [];
    for (const grupo of grupos) {
      const custo = custoDoModelo(
        {
          modelo: grupo.modelo,
          tokensEntrada: grupo._sum.tokensEntrada ?? 0,
          tokensSaida: grupo._sum.tokensSaida ?? 0,
        },
        precos,
      );
      if (custo === null) modelosSemPreco.push(grupo.modelo);
      else centavos += custo;
    }
    return { centavos, modelosSemPreco };
  }
}
