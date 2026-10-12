import { Injectable } from '@nestjs/common';
import { dataNoFuso } from '@mony/shared/datas';
import { FORMAS_PAGAMENTO, TIPOS_TRANSACAO } from '@mony/shared/enums';
import { MAXIMO_PARCELAS } from '@mony/shared/parcelamentos';
import type { DadosRascunho } from '@mony/shared/rascunhos';
import { z } from 'zod';

import { Clock } from '../../../core/clock/clock';
import { usuarioDoContexto } from '../../../core/contexto/contexto';
import { ErroDominio } from '../../../core/erros/erro-dominio';
import { CartoesService } from '../../cartoes/cartoes.service';
import { CategoriasService } from '../../categorias/categorias.service';
import { UsuariosService } from '../../usuarios/usuarios.service';
import { LancamentosMony } from '../lancamentos.service';
import { RoteadorRegras } from '../roteador-regras.service';
import { campos } from './campos';
import type { ContextoFerramenta, Ferramenta, SaidaFerramenta } from './registro';

const esquema = z.object({
  tipo: z.enum(TIPOS_TRANSACAO).describe('despesa (gasto) ou receita (dinheiro que entrou).'),
  descricao: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('Onde ou com o quê, curto: Mercado, iFood, Salário.'),
  valorCentavos: campos.valorCentavos,
  data: campos.data.optional().describe('AAAA-MM-DD; sem ela, hoje.'),
  categoriaId: campos
    .id('listar_categorias')
    .optional()
    .describe(
      'Categoria do mesmo tipo, de listar_categorias. Na despesa, sem certeza, deixe sem: o app pergunta com botões.',
    ),
  formaPagamento: z
    .enum(FORMAS_PAGAMENTO)
    .optional()
    .describe('Só na despesa. Sem a pessoa dizer, deixe sem: o app pergunta com botões.'),
  cartaoId: campos
    .id('listar_cartoes')
    .optional()
    .describe('Cartão da compra no crédito (formaPagamento cartao_credito).'),
  parcelas: z
    .number()
    .int()
    .min(1)
    .max(MAXIMO_PARCELAS)
    .optional()
    .describe('Compra parcelada no cartão de crédito; 1 ou sem, à vista.'),
});

/**
 * `criar_transacao` (doc 08). Receita completa grava direto. Despesa segue o rascunho (T-061): com
 * categoria e forma (e cartão no crédito), grava sem perguntas e mostra o resumo com [Desfazer]
 * (RN-082); faltando algo, o app pergunta com botões (RN-080).
 */
@Injectable()
export class CriarTransacaoTool implements Ferramenta<typeof esquema> {
  readonly nome = 'criar_transacao';
  readonly descricao =
    'Registra um gasto ou uma receita que a pessoa contou. Grava só o que ela disse; o que faltar o app pergunta com botões. Depois de gravar, diga em uma frase o que foi feito: o cartão de resumo com os detalhes e o [Desfazer] aparece abaixo da sua resposta.';
  readonly esquema = esquema;

  constructor(
    private readonly regras: RoteadorRegras,
    private readonly lancamentos: LancamentosMony,
    private readonly categorias: CategoriasService,
    private readonly cartoes: CartoesService,
    private readonly usuarios: UsuariosService,
    private readonly clock: Clock,
  ) {}

  async executar(
    contexto: ContextoFerramenta,
    entrada: z.output<typeof esquema>,
  ): Promise<SaidaFerramenta> {
    if (entrada.categoriaId !== undefined) {
      const categoria = await this.categorias.buscar(contexto, entrada.categoriaId);
      if (categoria.tipo !== entrada.tipo) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: `A categoria ${categoria.nome} é de ${categoria.tipo}.`,
        });
      }
    }
    if (entrada.tipo === 'receita') {
      if (entrada.categoriaId === undefined) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'Receita precisa de categoriaId (use listar_categorias com tipo receita).',
        });
      }
      const { lancamento, resumo } = await this.lancamentos.registrarTransacao(contexto, {
        tipo: 'receita',
        descricao: entrada.descricao,
        valorCentavos: entrada.valorCentavos,
        categoriaId: entrada.categoriaId,
        ...(entrada.data === undefined ? {} : { data: entrada.data }),
      });
      return { dados: { gravado: true, lancamento }, componentes: [resumo] };
    }

    if (entrada.cartaoId !== undefined) await this.cartoes.buscar(contexto, entrada.cartaoId);
    const perfil = await this.usuarios.perfil(usuarioDoContexto(contexto));
    const dados: DadosRascunho = {
      valorCentavos: entrada.valorCentavos,
      descricao: entrada.descricao,
      data: entrada.data ?? dataNoFuso(this.clock.agora(), perfil.fusoHorario),
      ...(entrada.categoriaId === undefined ? {} : { categoriaId: entrada.categoriaId }),
      ...(entrada.formaPagamento === undefined ? {} : { formaPagamento: entrada.formaPagamento }),
      ...(entrada.cartaoId === undefined ? {} : { cartaoId: entrada.cartaoId }),
      ...(entrada.parcelas === undefined ? {} : { parcelas: entrada.parcelas }),
    };
    if (dados.cartaoId !== undefined) dados.formaPagamento ??= 'cartao_credito';
    const resposta = await this.regras.iniciar(contexto, contexto.conversaId, dados);
    const componentes = resposta.componente ? [resposta.componente] : [];
    if (resposta.componente?.tipo === 'resumo') {
      return {
        dados: { gravado: true, lancamento: resposta.componente.lancamento },
        componentes,
      };
    }
    return {
      dados: {
        gravado: false,
        pergunta: resposta.texto,
        orientacao:
          'Ainda não gravou. Faça a pergunta em uma frase curta; os botões com as opções aparecem abaixo da sua resposta, então não liste as opções nem diga que anotou.',
      },
      componentes,
    };
  }
}
