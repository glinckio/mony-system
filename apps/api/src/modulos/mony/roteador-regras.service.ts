import { Injectable } from '@nestjs/common';
import type { Categoria } from '@mony/shared/categorias';
import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';
import { FORMAS_PAGAMENTO, type FormaPagamento } from '@mony/shared/enums';
import {
  type AcaoMony,
  type ComponenteMony,
  type OpcaoBotao,
  type RespostaAcaoMony,
  VALOR_OUTRA_CATEGORIA,
} from '@mony/shared/mony';
import { MAXIMO_PARCELAS } from '@mony/shared/parcelamentos';
import {
  acharPorNome,
  type CampoRascunho,
  type DadosRascunho,
  descricaoDoGasto,
  diasAtras,
  formaDoTexto,
  normalizar,
  parcelasDoTexto,
  preferidosPrimeiro,
  proximoCampo,
  valorDoGasto,
} from '@mony/shared/rascunhos';
import { somarDias } from '@mony/shared/recorrencias';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { CartoesService } from '../cartoes/cartoes.service';
import { CategoriasService } from '../categorias/categorias.service';
import { UsuariosService } from '../usuarios/usuarios.service';
import { LancamentosMony } from './lancamentos.service';
import { PreferenciasService } from './preferencias.service';
import { type Rascunho, RascunhosService } from './rascunhos.service';

/** RN-081: quantas categorias viram botão, além do [Outra]. */
const CATEGORIAS_EM_BOTAO = 4;
/** Janela do "mais usadas". */
const DIAS_DE_USO = 90;
/** Parcelas oferecidas em botão; outras quantidades vão por texto ("em 18x"). */
const PARCELAS_EM_BOTAO = [1, 2, 3, 4, 5, 6, 10, 12] as const;
/** Formas de pagamento oferecidas em botão; o crédito só com cartão cadastrado. */
const FORMAS_EM_BOTAO = [
  'pix',
  'debito',
  'cartao_credito',
  'dinheiro',
  'boleto',
] as const satisfies readonly FormaPagamento[];

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  pix: 'Pix',
  debito: 'Débito',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Crédito',
  boleto: 'Boleto',
};

/** "no Pix", "em dinheiro": como a forma entra na frase do resumo. */
const NA_FRASE: Record<Exclude<FormaPagamento, 'cartao_credito'>, string> = {
  pix: 'no Pix',
  debito: 'no débito',
  dinheiro: 'em dinheiro',
  boleto: 'no boleto',
};

const PERGUNTAS: Record<CampoRascunho, string> = {
  categoria: 'Em qual categoria?',
  forma_pagamento: 'Como você pagou?',
  cartao: 'Em qual cartão?',
  parcelas: 'À vista ou parcelado?',
};

const CAMPO_POR_EXTENSO: Record<CampoRascunho, string> = {
  categoria: 'a categoria',
  forma_pagamento: 'a forma de pagamento',
  cartao: 'o cartão',
  parcelas: 'se foi à vista ou parcelado',
};

/** Pedidos para largar o lançamento em andamento. */
const CANCELAR = /^(cancela(r)?|deixa (pra|para) la|esquece|desisto|nao quero mais)\b/;

const reais = (centavos: number) => formatarCentavos(centavos);
const rotuloParcelas = (parcelas: number) => (parcelas === 1 ? 'À vista' : `${String(parcelas)}x`);

/** A ação de um botão de pergunta do rascunho. */
export type AcaoRascunho = Extract<AcaoMony, { tipo: 'rascunho' }>;

/** Resposta sem o modelo: o texto da Mony, a próxima pergunta e o lançamento gravado. */
export interface RespostaRegra {
  texto: string;
  componente: ComponenteMony | null;
  transacaoId: string | null;
}

/**
 * O que fazer com a mensagem: responder por regra, ou mandar ao modelo. Com rascunho em andamento,
 * o modelo recebe a descrição dele e, depois da resposta, a pergunta pendente volta com os botões
 * (RN-080, RN-085).
 */
export type ResultadoRegras =
  | { tipo: 'resposta'; resposta: RespostaRegra }
  | { tipo: 'modelo'; rascunho: { descricao: string; pergunta: RespostaRegra } | null };

/** O que as regras consultam do usuário, uma vez por mensagem. */
interface Catalogo {
  hoje: DataCalendario;
  categorias: Categoria[];
  cartoes: { id: string; nome: string }[];
}

/**
 * Respostas por regra, sem o modelo (doc 08): o rascunho do lançamento ("gastei 10" → categoria →
 * forma de pagamento → cartão → à vista ou parcelado → gravado), uma pergunta por vez e sempre com
 * botões (RN-080). Toque em botão (RN-084) e texto que responde a pergunta (RN-085) completam o
 * rascunho; um gasto novo com valor troca o rascunho por outro.
 */
@Injectable()
export class RoteadorRegras {
  constructor(
    private readonly rascunhos: RascunhosService,
    private readonly categorias: CategoriasService,
    private readonly cartoes: CartoesService,
    private readonly lancamentos: LancamentosMony,
    private readonly preferencias: PreferenciasService,
    private readonly usuarios: UsuariosService,
    private readonly clock: Clock,
  ) {}

  async responder(contexto: Contexto, conversaId: string, texto: string): Promise<ResultadoRegras> {
    const atual = await this.rascunhos.ativo(conversaId);
    const valor = valorDoGasto(texto);
    if (valor !== null) {
      if (atual) await this.rascunhos.descartar(atual.id);
      const catalogo = await this.catalogo(contexto);
      const dados = this.aplicarTexto(
        {
          valorCentavos: valor,
          descricao: descricaoDoGasto(
            texto,
            catalogo.cartoes.map(({ nome }) => nome),
          ),
          data: somarDias(catalogo.hoje, -diasAtras(texto)),
        },
        texto,
        catalogo,
      );
      return {
        tipo: 'resposta',
        resposta: await this.avancar(contexto, conversaId, dados, catalogo, {
          antes: atual ? `Deixei de lado o lançamento de ${reais(atual.dados.valorCentavos)}.` : '',
          anotei: `Anotei ${reais(valor)}.`,
        }),
      };
    }
    if (!atual) return { tipo: 'modelo', rascunho: null };

    const normalizado = normalizar(texto.trim());
    if (CANCELAR.test(normalizado)) {
      await this.rascunhos.descartar(atual.id);
      return {
        tipo: 'resposta',
        resposta: {
          texto: `Tudo bem, deixei de lado o lançamento de ${reais(atual.dados.valorCentavos)}.`,
          componente: null,
          transacaoId: null,
        },
      };
    }
    const catalogo = await this.catalogo(contexto);
    if (atual.campoPendente === 'categoria' && /^outras?\b/.test(normalizado)) {
      return {
        tipo: 'resposta',
        resposta: await this.pergunta(contexto, atual, catalogo, { todasAsCategorias: true }),
      };
    }
    // RN-085: a resposta completa o rascunho em andamento.
    const dados = this.aplicarTexto(atual.dados, texto, catalogo);
    if (atual.campoPendente && proximoCampo(dados) !== atual.campoPendente) {
      return {
        tipo: 'resposta',
        resposta: await this.avancar(contexto, conversaId, dados, catalogo, {
          rascunhoId: atual.id,
        }),
      };
    }
    return {
      tipo: 'modelo',
      rascunho: {
        descricao: this.descrever(atual, catalogo),
        pergunta: await this.pergunta(contexto, atual, catalogo),
      },
    };
  }

  /**
   * Lançamento de despesa pedido pelo modelo (ferramenta `criar_transacao`): segue o mesmo caminho
   * do rascunho. Completo, grava e devolve o resumo (RN-082); senão, guarda o rascunho (trocando o
   * que houver) e devolve a pergunta do que falta, com botões (RN-080).
   */
  async iniciar(
    contexto: Contexto,
    conversaId: string,
    dados: DadosRascunho,
  ): Promise<RespostaRegra & { pendente: CampoRascunho | null }> {
    const catalogo = await this.catalogo(contexto);
    const resposta = await this.avancar(contexto, conversaId, dados, catalogo);
    if (resposta.componente?.tipo === 'resumo') return { ...resposta, pendente: null };
    const rascunho = await this.rascunhos.ativo(conversaId);
    return { ...resposta, pendente: rascunho?.campoPendente ?? null };
  }

  /**
   * Toque num botão (RN-084): responde o campo pendente do rascunho, sem o modelo. Devolve também o
   * rótulo do botão, que vai para o histórico.
   */
  async agir(
    contexto: Contexto,
    conversaId: string,
    acao: AcaoRascunho,
  ): Promise<{ resposta: RespostaAcaoMony; toque: string }> {
    const atual = await this.rascunhos.ativo(conversaId);
    if (!atual || atual.id !== acao.rascunhoId) throw new ErroDominio('RASCUNHO_EXPIRADO');
    if (atual.campoPendente !== acao.campo) {
      throw new ErroDominio('CONFLITO', { mensagem: 'Essa pergunta já foi respondida.' });
    }
    const catalogo = await this.catalogo(contexto);
    const invalido = () =>
      new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'Opção inválida para esta pergunta.' });
    let dados: DadosRascunho;
    let toque: string;
    switch (acao.campo) {
      case 'categoria': {
        if (acao.valor === VALOR_OUTRA_CATEGORIA) {
          return {
            toque: 'Outra',
            resposta: await this.pergunta(contexto, atual, catalogo, { todasAsCategorias: true }),
          };
        }
        const categoria = await this.categorias.buscar(contexto, acao.valor);
        if (categoria.tipo !== 'despesa') throw invalido();
        dados = { ...atual.dados, categoriaId: categoria.id };
        toque = categoria.nome;
        break;
      }
      case 'forma_pagamento': {
        const forma = FORMAS_PAGAMENTO.find((item) => item === acao.valor);
        if (!forma) throw invalido();
        dados = { ...atual.dados, formaPagamento: forma };
        toque = ROTULO_FORMA[forma];
        break;
      }
      case 'cartao': {
        const cartao = await this.cartoes.buscar(contexto, acao.valor);
        dados = { ...atual.dados, cartaoId: cartao.id };
        toque = cartao.nome;
        break;
      }
      case 'parcelas': {
        const parcelas = Number(acao.valor);
        if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAXIMO_PARCELAS) {
          throw invalido();
        }
        dados = { ...atual.dados, parcelas };
        toque = rotuloParcelas(parcelas);
        break;
      }
    }
    return {
      toque,
      resposta: await this.avancar(contexto, conversaId, dados, catalogo, { rascunhoId: atual.id }),
    };
  }

  private async catalogo(contexto: Contexto): Promise<Catalogo> {
    const [perfil, categorias, cartoes] = await Promise.all([
      this.usuarios.perfil(usuarioDoContexto(contexto)),
      this.categorias.listar(contexto, { tipo: 'despesa' }),
      this.cartoes.listar(contexto),
    ]);
    return {
      hoje: dataNoFuso(this.clock.agora(), perfil.fusoHorario),
      categorias: categorias.itens,
      cartoes: cartoes.itens.map(({ id, nome }) => ({ id, nome })),
    };
  }

  /**
   * Preenche o que o texto diz e o rascunho ainda não tem: categoria (pelo nome, na descrição ou
   * no texto), forma de pagamento, cartão (o nome dele já diz crédito) e parcelas (parcelado é no
   * crédito). O que já estava preenchido não muda.
   */
  private aplicarTexto(dados: DadosRascunho, texto: string, catalogo: Catalogo): DadosRascunho {
    const novo = { ...dados };
    const categoria =
      (dados.descricao ? acharPorNome(dados.descricao, catalogo.categorias) : null) ??
      acharPorNome(texto, catalogo.categorias);
    if (novo.categoriaId === undefined && categoria) novo.categoriaId = categoria.id;
    const forma = formaDoTexto(texto);
    const cartao = acharPorNome(texto, catalogo.cartoes);
    const parcelas = parcelasDoTexto(texto);
    if (novo.formaPagamento === undefined) {
      if (forma) novo.formaPagamento = forma;
      else if (cartao || (parcelas !== null && parcelas > 1))
        novo.formaPagamento = 'cartao_credito';
    }
    if (novo.formaPagamento === 'cartao_credito') {
      if (novo.cartaoId === undefined && cartao) novo.cartaoId = cartao.id;
      if (novo.parcelas === undefined && parcelas !== null) novo.parcelas = parcelas;
    }
    return novo;
  }

  /**
   * O próximo passo do rascunho (RN-080): grava o lançamento quando está completo, senão guarda o
   * rascunho e faz a próxima pergunta. Crédito sem cartão cadastrado volta para a forma de
   * pagamento; com um cartão só, ele já vale.
   */
  private async avancar(
    contexto: Contexto,
    conversaId: string,
    dados: DadosRascunho,
    catalogo: Catalogo,
    opcoes: { antes?: string; anotei?: string; rascunhoId?: string } = {},
  ): Promise<RespostaRegra> {
    let completo = { ...dados };
    const avisos: string[] = [];
    if (completo.formaPagamento === 'cartao_credito') {
      const [unico, ...outros] = catalogo.cartoes;
      if (!unico) {
        const { valorCentavos, descricao, data, categoriaId, deDocumento } = completo;
        completo = {
          valorCentavos,
          descricao,
          data,
          ...(categoriaId ? { categoriaId } : {}),
          ...(deDocumento ? { deDocumento } : {}),
        };
        avisos.push('Você ainda não tem cartão de crédito cadastrado.');
      } else if (outros.length === 0) {
        completo.cartaoId ??= unico.id;
      }
    }
    const campo = proximoCampo(completo);
    if (campo === null) {
      const gravado = await this.gravar(contexto, completo, catalogo);
      // Só o rascunho que acabou de ser completado sai; um lançamento novo não mexe em outro.
      if (opcoes.rascunhoId) await this.rascunhos.descartar(opcoes.rascunhoId);
      // O resumo já diz o valor: sem o "Anotei" da abertura.
      return { ...gravado, texto: juntar([opcoes.antes ?? '', ...avisos, gravado.texto]) };
    }
    const rascunho = await this.rascunhos.salvar(
      usuarioDoContexto(contexto),
      conversaId,
      completo,
      campo,
    );
    const pergunta = await this.pergunta(contexto, rascunho, catalogo);
    return {
      ...pergunta,
      texto: juntar([opcoes.antes ?? '', opcoes.anotei ?? '', ...avisos, pergunta.texto]),
    };
  }

  /** A pergunta do campo pendente, com os botões (RN-080, RN-081). */
  private async pergunta(
    contexto: Contexto,
    rascunho: Rascunho,
    catalogo: Catalogo,
    opcoes: { todasAsCategorias?: boolean } = {},
  ): Promise<RespostaRegra> {
    const campo = rascunho.campoPendente ?? proximoCampo(rascunho.dados) ?? 'categoria';
    const botao = (valor: string, rotulo: string): OpcaoBotao => ({
      id: valor,
      rotulo,
      acao: { tipo: 'rascunho', rascunhoId: rascunho.id, campo, valor },
    });
    let botoes: OpcaoBotao[];
    let texto = PERGUNTAS[campo];
    // RN-081: o que a pessoa já confirmou para este estabelecimento vem primeiro (RN-090).
    const preferida = await this.preferencias.doEstabelecimento(contexto, rascunho.dados.descricao);
    switch (campo) {
      case 'categoria': {
        const primeiro = (lista: readonly { id: string; nome: string }[]) =>
          preferidosPrimeiro(lista, ({ id }) => id, [preferida?.categoriaId]);
        if (opcoes.todasAsCategorias) {
          texto = 'Escolha a categoria:';
          botoes = primeiro(catalogo.categorias).map(({ id, nome }) => botao(id, nome));
        } else {
          const desde = somarDias(catalogo.hoje, -DIAS_DE_USO);
          const maisUsadas = await this.categorias.maisUsadas(contexto, desde, CATEGORIAS_EM_BOTAO);
          const daPreferencia = catalogo.categorias.filter(
            ({ id }) => id === preferida?.categoriaId,
          );
          botoes = [
            ...primeiro([...daPreferencia, ...maisUsadas])
              .slice(0, CATEGORIAS_EM_BOTAO)
              .map(({ id, nome }) => botao(id, nome)),
            botao(VALOR_OUTRA_CATEGORIA, 'Outra'),
          ];
        }
        break;
      }
      case 'forma_pagamento':
        botoes = preferidosPrimeiro(
          FORMAS_EM_BOTAO.filter(
            (forma) => forma !== 'cartao_credito' || catalogo.cartoes.length > 0,
          ),
          (forma) => forma,
          [preferida?.formaPagamento],
        ).map((forma) => botao(forma, ROTULO_FORMA[forma]));
        break;
      case 'cartao':
        botoes = preferidosPrimeiro(catalogo.cartoes, ({ id }) => id, [preferida?.cartaoId]).map(
          ({ id, nome }) => botao(id, nome),
        );
        break;
      case 'parcelas':
        botoes = PARCELAS_EM_BOTAO.map((parcelas) =>
          botao(String(parcelas), rotuloParcelas(parcelas)),
        );
        break;
    }
    return { texto, componente: { tipo: 'botoes', opcoes: botoes }, transacaoId: null };
  }

  /** Grava a despesa (à vista) ou o parcelamento no cartão, de origem `mony`, e o resumo. */
  private async gravar(
    contexto: Contexto,
    dados: DadosRascunho,
    catalogo: Catalogo,
  ): Promise<RespostaRegra> {
    const categoria = catalogo.categorias.find(({ id }) => id === dados.categoriaId);
    const categoriaId = dados.categoriaId ?? '';
    const forma = dados.formaPagamento ?? 'pix';
    const descricao = dados.descricao ?? categoria?.nome ?? 'Gasto';
    const parcelas = dados.parcelas ?? 1;
    // T-065: o lançamento lido de foto ou PDF fica com origem `foto`.
    if (dados.deDocumento) contexto = { ...contexto, deDocumento: true };
    const { lancamento, resumo } =
      forma === 'cartao_credito' && dados.cartaoId !== undefined && parcelas > 1
        ? await this.lancamentos.registrarParcelamento(contexto, {
            tipo: 'compra_cartao',
            nome: descricao.slice(0, 100),
            valorCentavos: dados.valorCentavos,
            totalParcelas: parcelas,
            dataInicio: dados.data,
            categoriaId,
            cartaoId: dados.cartaoId,
          })
        : await this.lancamentos.registrarTransacao(contexto, {
            tipo: 'despesa',
            descricao,
            valorCentavos: dados.valorCentavos,
            data: dados.data,
            categoriaId,
            formaPagamento: forma,
            ...(forma === 'cartao_credito' && dados.cartaoId !== undefined
              ? { cartaoId: dados.cartaoId }
              : {}),
          });
    const noCartao = `no ${lancamento.cartao ?? 'cartão'}`;
    const onde =
      forma !== 'cartao_credito'
        ? NA_FRASE[forma]
        : lancamento.parcelas
          ? `${noCartao} em ${String(lancamento.parcelas)}x de ${reais(lancamento.valorParcelaCentavos ?? 0)}`
          : noCartao;
    const deQue = categoria && descricao !== categoria.nome ? ` de ${descricao}` : '';
    const quando =
      dados.data === catalogo.hoje
        ? ''
        : `, em ${dados.data.slice(8, 10)}/${dados.data.slice(5, 7)}`;
    return {
      texto: `Pronto! Anotei ${reais(dados.valorCentavos)}${deQue} em ${lancamento.categoria}, ${onde}${quando}.`,
      componente: resumo,
      transacaoId: lancamento.transacaoId,
    };
  }

  /** O rascunho em palavras, para o modelo saber o que está em andamento (RN-085). */
  private descrever(rascunho: Rascunho, catalogo: Catalogo): string {
    const { dados } = rascunho;
    const partes = [reais(dados.valorCentavos)];
    if (dados.descricao) partes.push(`"${dados.descricao}"`);
    const categoria = catalogo.categorias.find(({ id }) => id === dados.categoriaId);
    if (categoria) partes.push(`categoria ${categoria.nome}`);
    if (dados.formaPagamento) partes.push(ROTULO_FORMA[dados.formaPagamento]);
    const cartao = catalogo.cartoes.find(({ id }) => id === dados.cartaoId);
    if (cartao) partes.push(`cartão ${cartao.nome}`);
    const campo = rascunho.campoPendente ?? proximoCampo(dados);
    return `${partes.join(', ')}; falta ${campo ? CAMPO_POR_EXTENSO[campo] : 'nada'}.`;
  }
}

function juntar(partes: readonly string[]): string {
  return partes.filter((parte) => parte !== '').join(' ');
}
