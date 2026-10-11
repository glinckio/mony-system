import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { dataNoFuso } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { FormaPagamento } from '@mony/shared/enums';
import {
  type AcaoMony,
  type ComponenteMony,
  type DadosMensagemMony,
  type EventoMony,
  FORMAS_DO_GASTO_RAPIDO,
  type RespostaAcaoMony,
  valorDoGasto,
} from '@mony/shared/mony';
import { somarDias } from '@mony/shared/recorrencias';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { ErroLlm, LlmProvider } from '../../integracoes/ia/llm.provider';
import { CategoriasService } from '../categorias/categorias.service';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';
import { TransacoesService } from '../transacoes/transacoes.service';
import { MonyRepository } from './mony.repository';

/** Prompt da PoC (T-020). A versão de verdade vem de `mony_config` (T-068). */
export const PROMPT_POC = [
  'Você é a Mony, assistente financeira do app Monitorizze. Fale em português do Brasil, de forma',
  'direta, amigável e sem julgamento. Não dê recomendação de investimento. Responda em até três',
  'frases. Nesta versão você ainda não lança nada: se a pessoa contar um gasto sem valor, peça o',
  'valor (ex.: "gastei 10").',
].join(' ');

/** RN-081: quantas categorias viram botão. */
const CATEGORIAS_EM_BOTAO = 4;
/** Janela do "mais usadas". */
const DIAS_DE_USO = 90;

const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  debito: 'Débito',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  boleto: 'Boleto',
};

/**
 * Mony da PoC T-020 (doc 08): "gastei 10" segue por regra, com botões de categoria e de forma de
 * pagamento, e grava a despesa; o resto vai para o modelo, em streaming. O orquestrador completo
 * (ferramentas, rascunhos, histórico, logs_ia) é da T-060 e da T-061.
 */
@Injectable()
export class MonyService {
  private readonly log = new Logger(MonyService.name);

  constructor(
    private readonly repositorio: MonyRepository,
    private readonly llm: LlmProvider,
    private readonly categorias: CategoriasService,
    private readonly transacoes: TransacoesService,
    private readonly clock: Clock,
  ) {}

  /** Os eventos do SSE de uma mensagem; termina sempre com `fim`. */
  async *responder(
    contexto: Contexto,
    dados: DadosMensagemMony,
    sinal?: AbortSignal,
  ): AsyncGenerator<EventoMony> {
    const usuarioId = usuarioDoContexto(contexto);
    const valor = valorDoGasto(dados.texto);
    if (valor !== null) {
      yield { tipo: 'texto.delta', texto: `Anotei ${formatarCentavos(valor)}. Em qual categoria?` };
      yield { tipo: 'componente', componente: await this.botoesDeCategoria(usuarioId, valor) };
    } else {
      try {
        for await (const evento of this.llm.conversar({
          sistema: PROMPT_POC,
          mensagens: [{ papel: 'usuario', texto: dados.texto }],
          ...(sinal ? { sinal } : {}),
        })) {
          if (evento.tipo === 'texto') yield { tipo: 'texto.delta', texto: evento.texto };
          else
            this.log.log(
              `Mony: ${String(evento.tokensEntrada)} tokens de entrada, ${String(evento.tokensSaida)} de saída`,
            );
        }
      } catch (erro) {
        if (sinal?.aborted) return;
        const motivo = erro instanceof Error ? erro.message : String(erro);
        this.log.warn(`Mony sem resposta do modelo: ${motivo}`);
        yield {
          tipo: 'erro',
          codigo:
            erro instanceof ErroLlm && !erro.transitorio ? 'ERRO_INTERNO' : 'SERVICO_INDISPONIVEL',
          mensagem: 'Não consegui responder agora. Tente de novo em instantes.',
        };
      }
    }
    yield { tipo: 'fim', mensagemId: randomUUID() };
  }

  /** Toque num botão (RN-084): avança o lançamento sem passar pelo modelo. */
  async agir(contexto: Contexto, acao: AcaoMony): Promise<RespostaAcaoMony> {
    const categoria = await this.categorias.buscar(contexto, acao.categoriaId);
    if (categoria.tipo !== 'despesa') {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'A categoria do gasto precisa ser de despesa.',
      });
    }
    if (acao.etapa === 'categoria') {
      return {
        texto: 'Como você pagou?',
        componente: {
          tipo: 'botoes',
          opcoes: FORMAS_DO_GASTO_RAPIDO.map((forma) => ({
            id: forma,
            rotulo: ROTULO_FORMA[forma],
            acao: { ...acao, etapa: 'forma', formaPagamento: forma },
          })),
        },
        transacaoId: null,
      };
    }
    const { transacao } = await this.transacoes.registrar(
      { ...contexto, origem: 'mony' },
      {
        tipo: 'despesa',
        descricao: categoria.nome,
        valorCentavos: acao.valorCentavos,
        categoriaId: categoria.id,
        formaPagamento: acao.formaPagamento,
      },
    );
    return {
      texto: `Pronto! Anotei ${formatarCentavos(acao.valorCentavos)} em ${categoria.nome}, no ${ROTULO_FORMA[acao.formaPagamento]}.`,
      componente: null,
      transacaoId: transacao.id,
    };
  }

  private async botoesDeCategoria(
    usuarioId: string,
    valorCentavos: number,
  ): Promise<ComponenteMony> {
    const fuso = await this.repositorio.fusoDoUsuario(usuarioId);
    const desde = paraDataDoBanco(somarDias(dataNoFuso(this.clock.agora(), fuso), -DIAS_DE_USO));
    const categorias = await this.repositorio.categoriasMaisUsadas(
      usuarioId,
      desde,
      CATEGORIAS_EM_BOTAO,
    );
    return {
      tipo: 'botoes',
      opcoes: categorias.map(({ id, nome }) => ({
        id,
        rotulo: nome,
        acao: { etapa: 'categoria', valorCentavos, categoriaId: id },
      })),
    };
  }
}
