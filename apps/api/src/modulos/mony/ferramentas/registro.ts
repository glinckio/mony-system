import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ComponenteMony } from '@mony/shared/mony';
import { z } from 'zod';

import type { Contexto } from '../../../core/contexto/contexto';
import { ErroDominio } from '../../../core/erros/erro-dominio';
import type { ChamadaFerramenta, FerramentaLlm } from '../../../integracoes/ia/llm.provider';

/**
 * Uma ferramenta da Mony (doc 08): o modelo escolhe pelo `nome` e pela `descricao` e manda a
 * entrada; o `esquema` (Zod) vira o JSON Schema que o modelo vê e valida a entrada antes de
 * `executar`, que só chama Services. O usuário vem do `contexto`, nunca da entrada (RN-092).
 */
export interface Ferramenta<TEsquema extends z.ZodType = z.ZodType> {
  readonly nome: string;
  readonly descricao: string;
  readonly esquema: TEsquema;
  executar(contexto: ContextoFerramenta, entrada: z.output<TEsquema>): Promise<SaidaFerramenta>;
}

/** O contexto da Mony (origem `mony`) e a conversa, para quem mexe no rascunho. */
export type ContextoFerramenta = Contexto & { readonly conversaId: string };

/**
 * O que a ferramenta devolve: os `dados` vão ao modelo em JSON; os `componentes` (resumo com
 * [Desfazer], botões de confirmação ou de pergunta) vão ao app depois da resposta.
 */
export interface SaidaFerramenta {
  dados: unknown;
  componentes?: readonly ComponenteMony[];
}

/** As ferramentas registradas no módulo (provedor do Nest). */
export const FERRAMENTAS_MONY = Symbol('FERRAMENTAS_MONY');

/** O que volta ao modelo (o resultado em JSON, ou a falha com o motivo) e os componentes. */
export interface ResultadoFerramenta {
  conteudo: string;
  erro: boolean;
  componentes: readonly ComponenteMony[];
}

const falha = (motivo: unknown): ResultadoFerramenta => ({
  conteudo: JSON.stringify({ erro: motivo }),
  erro: true,
  componentes: [],
});

/** Guarda as ferramentas, mostra-as ao modelo e executa os pedidos dele. */
@Injectable()
export class RegistroFerramentas {
  private readonly log = new Logger(RegistroFerramentas.name);
  private readonly porNome = new Map<string, Ferramenta>();
  private readonly definicoes: FerramentaLlm[];

  constructor(@Inject(FERRAMENTAS_MONY) ferramentas: readonly Ferramenta[]) {
    for (const ferramenta of ferramentas) {
      if (this.porNome.has(ferramenta.nome)) {
        throw new Error(`Ferramenta da Mony repetida: ${ferramenta.nome}`);
      }
      this.porNome.set(ferramenta.nome, ferramenta);
    }
    this.definicoes = ferramentas.map(({ nome, descricao, esquema }) => {
      const esquemaEntrada: Record<string, unknown> = z.toJSONSchema(esquema, { io: 'input' });
      // O provedor não precisa da versão do JSON Schema.
      delete esquemaEntrada.$schema;
      return { nome, descricao, esquemaEntrada };
    });
  }

  /** Como o modelo vê as ferramentas: nome, descrição e o JSON Schema da entrada. */
  paraModelo(): readonly FerramentaLlm[] {
    return this.definicoes;
  }

  /**
   * Executa um pedido do modelo. Ferramenta que não existe, entrada inválida e erro de regra voltam
   * ao modelo como falha, para ele corrigir ou contar ao usuário (RN-087); erro inesperado vai ao
   * log e volta como falha genérica.
   */
  async executar(
    contexto: ContextoFerramenta,
    chamada: ChamadaFerramenta,
  ): Promise<ResultadoFerramenta> {
    const ferramenta = this.porNome.get(chamada.nome);
    if (!ferramenta) return falha(`A ferramenta ${chamada.nome} não existe.`);
    const entrada = ferramenta.esquema.safeParse(chamada.entrada);
    if (!entrada.success) {
      return falha({ codigo: 'REQUISICAO_INVALIDA', detalhes: z.prettifyError(entrada.error) });
    }
    try {
      const { dados, componentes = [] } = await ferramenta.executar(contexto, entrada.data);
      return { conteudo: JSON.stringify(dados ?? null), erro: false, componentes };
    } catch (erro) {
      if (erro instanceof ErroDominio) {
        return falha({ codigo: erro.codigo, mensagem: erro.message });
      }
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.log.error(
        `Falha na ferramenta ${chamada.nome} da Mony: ${motivo}`,
        erro instanceof Error ? erro.stack : undefined,
      );
      return falha({ codigo: 'ERRO_INTERNO', mensagem: 'Falha interna.' });
    }
  }
}
