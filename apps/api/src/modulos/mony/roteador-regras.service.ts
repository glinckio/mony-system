import { Injectable } from '@nestjs/common';
import { dataNoFuso } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { FormaPagamento } from '@mony/shared/enums';
import {
  type AcaoMony,
  type ComponenteMony,
  FORMAS_DO_GASTO_RAPIDO,
  type RespostaAcaoMony,
  valorDoGasto,
} from '@mony/shared/mony';
import { somarDias } from '@mony/shared/recorrencias';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { CategoriasService } from '../categorias/categorias.service';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';
import { TransacoesService } from '../transacoes/transacoes.service';
import { MonyRepository } from './mony.repository';

/** RN-081: quantas categorias viram botão. */
const CATEGORIAS_EM_BOTAO = 4;
/** Janela do "mais usadas". */
const DIAS_DE_USO = 90;

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  debito: 'Débito',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  boleto: 'Boleto',
};

/** Resposta sem o modelo: o texto da Mony e, se houver, a próxima pergunta com botões. */
export interface RespostaRegra {
  texto: string;
  componente: ComponenteMony | null;
}

/**
 * Respostas por regra, sem o modelo (doc 08). Por enquanto o fluxo "gastei 10" da PoC T-020: o
 * valor, botões de categoria e de forma de pagamento, e a despesa gravada. Rascunhos no servidor e
 * texto livre respondendo a um rascunho vêm na T-061.
 */
@Injectable()
export class RoteadorRegras {
  constructor(
    private readonly repositorio: MonyRepository,
    private readonly categorias: CategoriasService,
    private readonly transacoes: TransacoesService,
    private readonly clock: Clock,
  ) {}

  /** A resposta da mensagem, se uma regra resolve; `null` manda a mensagem ao modelo. */
  async responder(contexto: Contexto, texto: string): Promise<RespostaRegra | null> {
    const valor = valorDoGasto(texto);
    if (valor === null) return null;
    return {
      texto: `Anotei ${formatarCentavos(valor)}. Em qual categoria?`,
      componente: await this.botoesDeCategoria(usuarioDoContexto(contexto), valor),
    };
  }

  /**
   * Toque num botão (RN-084): avança o lançamento sem passar pelo modelo. Devolve também o rótulo
   * do botão tocado, que vai para o histórico.
   */
  async agir(
    contexto: Contexto,
    acao: AcaoMony,
  ): Promise<{ resposta: RespostaAcaoMony; toque: string }> {
    const categoria = await this.categorias.buscar(contexto, acao.categoriaId);
    if (categoria.tipo !== 'despesa') {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'A categoria do gasto precisa ser de despesa.',
      });
    }
    if (acao.etapa === 'categoria') {
      return {
        toque: categoria.nome,
        resposta: {
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
        },
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
      toque: ROTULO_FORMA[acao.formaPagamento],
      resposta: {
        texto: `Pronto! Anotei ${formatarCentavos(acao.valorCentavos)} em ${categoria.nome}, no ${ROTULO_FORMA[acao.formaPagamento]}.`,
        componente: null,
        transacaoId: transacao.id,
      },
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
