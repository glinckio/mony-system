import { Injectable, Logger } from '@nestjs/common';
import { competenciaDe, type DataCalendario } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { ImpactoLancamento } from '@mony/shared/mony';
import { faixaDoOrcamento } from '@mony/shared/orcamentos';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { nomeDoMes } from '../alertas/textos';
import { CartoesService } from '../cartoes/cartoes.service';
import { OrcamentosService } from '../orcamentos/orcamentos.service';

/** O lançamento recém-gravado, no que importa para o impacto. */
export interface LancamentoParaImpacto {
  tipo: 'despesa' | 'receita';
  categoriaId: string;
  categoria: string;
  /** A data da despesa; no parcelamento, a da primeira parcela. */
  data: DataCalendario;
  cartaoId: string | null;
}

type ImpactoOrcamento = NonNullable<ImpactoLancamento['orcamento']>;
type ImpactoCartao = NonNullable<ImpactoLancamento['cartao']>;

const reais = (centavos: number) => formatarCentavos(centavos);

/**
 * Consultoria pós-lançamento (RN-089, T-067): depois de gravar, a Mony diz como ficou o orçamento
 * da categoria no mês da despesa e o limite do cartão. Os números vêm dos Services de orçamento e
 * de cartão, os mesmos das telas.
 */
@Injectable()
export class ConsultoriaMony {
  private readonly log = new Logger(ConsultoriaMony.name);

  constructor(
    private readonly orcamentos: OrcamentosService,
    private readonly cartoes: CartoesService,
  ) {}

  /**
   * O impacto do lançamento; `null` sem orçamento na categoria nem cartão. Uma falha aqui vai ao
   * log e não desfaz o que foi gravado: o lançamento só fica sem o comentário.
   */
  async doLancamento(
    contexto: Contexto,
    lancamento: LancamentoParaImpacto,
  ): Promise<ImpactoLancamento | null> {
    try {
      const usuarioId = usuarioDoContexto(contexto);
      const competencia = competenciaDe(lancamento.data);
      const [orcamento, limite] = await Promise.all([
        lancamento.tipo === 'despesa'
          ? this.orcamentos.situacao(usuarioId, lancamento.categoriaId, competencia)
          : null,
        lancamento.cartaoId === null
          ? null
          : this.cartoes.situacaoDoLimite(usuarioId, lancamento.cartaoId),
      ]);
      const impacto = {
        orcamento: orcamento && {
          categoria: lancamento.categoria,
          competencia,
          percentualUsado: orcamento.percentualUsado,
          restanteCentavos: orcamento.restanteCentavos,
          faixa: orcamento.faixa,
        },
        cartao: limite && {
          cartao: limite.nome,
          percentualUsado: limite.limite.percentualUsado,
          disponivelCentavos: limite.limite.limiteDisponivel,
          // Abaixo do limite, a conta inteira pode dar 100%; "estourado" é só o que passou.
          faixa:
            limite.limite.limiteDisponivel < 0
              ? ('estourado' as const)
              : faixaDoOrcamento(Math.min(limite.limite.percentualUsado, 99)),
        },
      };
      if (!impacto.orcamento && !impacto.cartao) return null;
      return { ...impacto, comentario: comentar(impacto.orcamento, impacto.cartao) };
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.log.warn(`Impacto do lançamento da Mony não calculado: ${motivo}`);
      return null;
    }
  }
}

/** RN-089 e RN-091: uma frase por efeito, direta; "Atenção" a partir de 80%. */
export function comentar(orcamento: ImpactoOrcamento | null, cartao: ImpactoCartao | null): string {
  const partes: string[] = [];
  if (orcamento) {
    const mes = nomeDoMes(orcamento.competencia);
    const { categoria, percentualUsado: usado, restanteCentavos: restante } = orcamento;
    if (restante < 0) {
      partes.push(
        `${categoria} passou ${reais(-restante)} do orçamento de ${mes} (${String(usado)}%).`,
      );
    } else if (restante === 0) {
      partes.push(`${categoria} chegou ao limite do orçamento de ${mes}.`);
    } else if (orcamento.faixa === 'normal') {
      partes.push(
        `${categoria}: ${String(usado)}% do orçamento de ${mes}, faltam ${reais(restante)}.`,
      );
    } else {
      partes.push(
        `Atenção: ${categoria} já usou ${String(usado)}% do orçamento de ${mes}; faltam ${reais(restante)}.`,
      );
    }
  }
  if (cartao) {
    const { cartao: nome, percentualUsado: usado, disponivelCentavos: disponivel } = cartao;
    if (disponivel < 0) {
      partes.push(`O ${nome} passou ${reais(-disponivel)} do limite.`);
    } else if (disponivel === 0) {
      partes.push(`O ${nome} chegou ao limite.`);
    } else if (cartao.faixa === 'normal') {
      partes.push(`${nome}: ${String(usado)}% do limite usado, ${reais(disponivel)} disponíveis.`);
    } else {
      partes.push(
        `Atenção: o ${nome} já usa ${String(usado)}% do limite; restam ${reais(disponivel)}.`,
      );
    }
  }
  return partes.join(' ');
}
