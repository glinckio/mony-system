import { Injectable } from '@nestjs/common';
import type {
  AutorMensagem,
  FormaPagamento,
  StatusImportacao,
  TipoImportacao,
  TipoMensagem,
} from '@mony/shared/enums';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';

const CAMPOS_MENSAGEM = {
  id: true,
  autor: true,
  tipo: true,
  conteudo: true,
  componentes: true,
  anexoId: true,
  criadoEm: true,
} as const;

/** Uma mensagem como sai do banco. */
export interface MensagemSalva {
  id: string;
  autor: AutorMensagem;
  tipo: TipoMensagem;
  conteudo: string | null;
  componentes: unknown;
  /** O áudio (ou a imagem) da mensagem do usuário. */
  anexoId: string | null;
  criadoEm: Date;
}

/** Onde a página do histórico parou: a criação e o id da última mensagem. */
export interface PosicaoMensagem {
  criadoEm: Date;
  id: string;
}

export interface NovaMensagem {
  usuarioId: string;
  conversaId: string;
  autor: AutorMensagem;
  tipo: TipoMensagem;
  conteudo: string | null;
  componentes: readonly object[];
  anexoId?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface NovoLogIa {
  usuarioId: string;
  mensagemId: string;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  ferramenta: string | null;
  duracaoMs: number;
  erro: string | null;
}

/** Uma importação de documento (T-065) como sai do banco; `resultado` é validado por quem lê. */
export interface ImportacaoSalva {
  id: string;
  /** Nulo no cupom fiscal lido pelo QR Code (T-066a). */
  arquivoId: string | null;
  tipo: TipoImportacao;
  status: StatusImportacao;
  resultado: unknown;
}

const CAMPOS_IMPORTACAO = {
  id: true,
  arquivoId: true,
  tipo: true,
  status: true,
  resultado: true,
} as const;

/** Uma versão do prompt da Mony (T-068); `ferramentas` e `avaliacao` são validados por quem lê. */
export interface ConfigSalva {
  versao: number;
  promptSistema: string;
  ferramentas: unknown;
  modelo: string;
  ativo: boolean;
  avaliacao: unknown;
}

const CAMPOS_CONFIG = {
  versao: true,
  promptSistema: true,
  ferramentas: true,
  modelo: true,
  ativo: true,
  avaliacao: true,
} as const;

/** Um rascunho de lançamento como sai do banco; `dados` é validado por quem lê. */
export interface RascunhoSalvo {
  id: string;
  dados: unknown;
  campoPendente: string | null;
  expiraEm: Date;
}

const CAMPOS_RASCUNHO = { id: true, dados: true, campoPendente: true, expiraEm: true } as const;

/** Estabelecimento → categoria, cartão e forma de pagamento (RN-090). */
export interface Combinacao {
  categoriaId: string | null;
  cartaoId: string | null;
  formaPagamento: FormaPagamento | null;
}

export interface PreferenciaSalva extends Combinacao {
  chave: string;
  contagem: number;
}

const CAMPOS_PREFERENCIA = {
  chave: true,
  categoriaId: true,
  cartaoId: true,
  formaPagamento: true,
  contagem: true,
} as const;

/** Mensagens antes de uma posição: mais antigas pela criação e, no empate, pelo id (UUIDv7). */
function antesDe(posicao: PosicaoMensagem): Prisma.MensagemWhereInput {
  return {
    OR: [
      { criadoEm: { lt: posicao.criadoEm } },
      { criadoEm: posicao.criadoEm, id: { lt: posicao.id } },
    ],
  };
}

/** Consultas da Mony; tudo filtra pelo `usuarioId` (doc 05). */
@Injectable()
export class MonyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A conversa mais recente do usuário; a primeira mensagem cria uma. */
  async conversaAtual(usuarioId: string): Promise<string> {
    const atual = await this.prisma.cliente.conversa.findFirst({
      where: { usuarioId },
      orderBy: [{ iniciadaEm: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (atual) return atual.id;
    const nova = await this.prisma.cliente.conversa.create({
      data: { usuarioId },
      select: { id: true },
    });
    return nova.id;
  }

  mensagemPorChave(conversaId: string, idempotencyKey: string): Promise<MensagemSalva | null> {
    return this.prisma.cliente.mensagem.findUnique({
      where: { conversaId_idempotencyKey: { conversaId, idempotencyKey } },
      select: CAMPOS_MENSAGEM,
    });
  }

  /**
   * Grava a mensagem e a hora da última mensagem da conversa. `null` se a chave de idempotência
   * já existe na conversa (duas respostas à mesma mensagem ao mesmo tempo).
   */
  async salvarMensagem(dados: NovaMensagem): Promise<MensagemSalva | null> {
    const { componentes, idempotencyKey, anexoId, ...resto } = dados;
    try {
      const [mensagem] = await this.prisma.cliente.$transaction([
        this.prisma.cliente.mensagem.create({
          data: {
            ...resto,
            componentes:
              componentes.length > 0 ? (componentes as Prisma.InputJsonArray) : Prisma.DbNull,
            ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
            ...(anexoId === undefined ? {} : { anexoId }),
          },
          select: CAMPOS_MENSAGEM,
        }),
        this.prisma.cliente.conversa.update({
          where: { id: dados.conversaId },
          data: { ultimaMensagemEm: new Date() },
          select: { id: true },
        }),
      ]);
      return mensagem;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        return null;
      }
      throw erro;
    }
  }

  /** A mensagem que já usa o anexo (o áudio só vale para uma mensagem). */
  mensagemDoAnexo(anexoId: string): Promise<{ id: string } | null> {
    return this.prisma.cliente.mensagem.findUnique({ where: { anexoId }, select: { id: true } });
  }

  /** O texto da mensagem de voz, depois da transcrição (T-064). */
  async atualizarConteudo(id: string, conteudo: string): Promise<void> {
    await this.prisma.cliente.mensagem.update({ where: { id }, data: { conteudo } });
  }

  /** As últimas mensagens da conversa antes de uma, da mais nova para a mais antiga. */
  mensagensAntes(
    conversaId: string,
    posicao: PosicaoMensagem,
    quantidade: number,
  ): Promise<MensagemSalva[]> {
    return this.prisma.cliente.mensagem.findMany({
      where: { conversaId, ...antesDe(posicao) },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: quantidade,
      select: CAMPOS_MENSAGEM,
    });
  }

  /** Histórico do usuário, da mais nova para a mais antiga, em todas as conversas. */
  historico(
    usuarioId: string,
    texto: string | undefined,
    depoisDe: PosicaoMensagem | null,
    quantidade: number,
  ): Promise<MensagemSalva[]> {
    return this.prisma.cliente.mensagem.findMany({
      where: {
        usuarioId,
        ...(texto === undefined ? {} : { conteudo: { contains: texto, mode: 'insensitive' } }),
        ...(depoisDe ? antesDe(depoisDe) : {}),
      },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: quantidade,
      select: CAMPOS_MENSAGEM,
    });
  }

  rascunhoDaConversa(conversaId: string): Promise<RascunhoSalvo | null> {
    return this.prisma.cliente.rascunhoLancamento.findUnique({
      where: { conversaId },
      select: CAMPOS_RASCUNHO,
    });
  }

  /** RN-088: um rascunho por conversa; gravar de novo troca o que havia. */
  salvarRascunho(dados: {
    usuarioId: string;
    conversaId: string;
    dados: object;
    campoPendente: string | null;
    expiraEm: Date;
  }): Promise<RascunhoSalvo> {
    const campos = {
      dados: dados.dados as Prisma.InputJsonObject,
      campoPendente: dados.campoPendente,
      expiraEm: dados.expiraEm,
    };
    return this.prisma.cliente.rascunhoLancamento.upsert({
      where: { conversaId: dados.conversaId },
      create: { usuarioId: dados.usuarioId, conversaId: dados.conversaId, ...campos },
      update: campos,
      select: CAMPOS_RASCUNHO,
    });
  }

  async excluirRascunho(id: string): Promise<void> {
    await this.prisma.cliente.rascunhoLancamento.deleteMany({ where: { id } });
  }

  /** Limpeza diária (RN-088): apaga os rascunhos vencidos de todos os usuários. */
  async excluirRascunhosVencidos(agora: Date): Promise<number> {
    const { count } = await this.prisma.cliente.rascunhoLancamento.deleteMany({
      where: { expiraEm: { lte: agora } },
    });
    return count;
  }

  preferencia(usuarioId: string, chave: string): Promise<PreferenciaSalva | null> {
    return this.prisma.cliente.preferenciaAprendida.findUnique({
      where: { usuarioId_chave: { usuarioId, chave } },
      select: CAMPOS_PREFERENCIA,
    });
  }

  /** As preferências com mais confirmações (e, no empate, as mais recentes). */
  preferenciasPrincipais(usuarioId: string, quantidade: number): Promise<PreferenciaSalva[]> {
    return this.prisma.cliente.preferenciaAprendida.findMany({
      where: { usuarioId },
      orderBy: [{ contagem: 'desc' }, { atualizadoEm: 'desc' }],
      take: quantidade,
      select: CAMPOS_PREFERENCIA,
    });
  }

  /**
   * RN-090: a combinação confirmada para o estabelecimento. A mesma de antes soma 1 na contagem;
   * outra toma o lugar e começa do 1.
   */
  async aprenderPreferencia(
    usuarioId: string,
    chave: string,
    combinacao: Combinacao,
  ): Promise<PreferenciaSalva> {
    const atual = await this.preferencia(usuarioId, chave);
    const mesma =
      atual !== null &&
      atual.categoriaId === combinacao.categoriaId &&
      atual.cartaoId === combinacao.cartaoId &&
      atual.formaPagamento === combinacao.formaPagamento;
    return this.prisma.cliente.preferenciaAprendida.upsert({
      where: { usuarioId_chave: { usuarioId, chave } },
      create: { usuarioId, chave, ...combinacao, contagem: 1 },
      update: mesma ? { contagem: { increment: 1 } } : { ...combinacao, contagem: 1 },
      select: CAMPOS_PREFERENCIA,
    });
  }

  async registrarLogIa(dados: NovoLogIa): Promise<void> {
    await this.prisma.cliente.logIa.create({ data: dados, select: { id: true } });
  }

  /** A versão ativa do prompt da Mony; `null` sem nenhuma (vale o prompt local). */
  configAtiva(): Promise<ConfigSalva | null> {
    return this.prisma.cliente.monyConfig.findFirst({
      where: { ativo: true },
      orderBy: { versao: 'desc' },
      select: CAMPOS_CONFIG,
    });
  }

  configDaVersao(versao: number): Promise<ConfigSalva | null> {
    return this.prisma.cliente.monyConfig.findUnique({ where: { versao }, select: CAMPOS_CONFIG });
  }

  /** Grava a próxima versão (a maior + 1), inativa. */
  async criarConfig(dados: {
    promptSistema: string;
    ferramentas: object;
    modelo: string;
    criadoPorId: string | null;
  }): Promise<ConfigSalva> {
    return this.prisma.cliente.$transaction(async (tx) => {
      // Duas versões criadas ao mesmo tempo esperam uma pela outra.
      await tx.$executeRaw`LOCK TABLE mony_config IN SHARE ROW EXCLUSIVE MODE`;
      const ultima = await tx.monyConfig.aggregate({ _max: { versao: true } });
      return tx.monyConfig.create({
        data: {
          versao: (ultima._max.versao ?? 0) + 1,
          promptSistema: dados.promptSistema,
          ferramentas: dados.ferramentas as Prisma.InputJsonObject,
          modelo: dados.modelo,
          criadoPorId: dados.criadoPorId,
        },
        select: CAMPOS_CONFIG,
      });
    });
  }

  async salvarAvaliacaoConfig(versao: number, avaliacao: object): Promise<void> {
    await this.prisma.cliente.monyConfig.update({
      where: { versao },
      data: { avaliacao: avaliacao as Prisma.InputJsonObject },
      select: { id: true },
    });
  }

  /** Só uma versão ativa: as outras saem na mesma transação. */
  async ativarConfig(versao: number): Promise<void> {
    await this.prisma.cliente.$transaction([
      this.prisma.cliente.monyConfig.updateMany({
        where: { ativo: true, versao: { not: versao } },
        data: { ativo: false },
      }),
      this.prisma.cliente.monyConfig.update({
        where: { versao },
        data: { ativo: true },
        select: { id: true },
      }),
    ]);
  }

  /** A importação do arquivo, se já houve leitura (o reenvio não lê de novo o que deu certo). */
  importacaoDoArquivo(usuarioId: string, arquivoId: string): Promise<ImportacaoSalva | null> {
    return this.prisma.cliente.importacaoDocumento.findFirst({
      where: { usuarioId, arquivoId },
      orderBy: { criadoEm: 'desc' },
      select: CAMPOS_IMPORTACAO,
    });
  }

  criarImportacao(
    usuarioId: string,
    arquivoId: string | null,
    tipo: TipoImportacao,
  ): Promise<ImportacaoSalva> {
    return this.prisma.cliente.importacaoDocumento.create({
      data: { usuarioId, arquivoId, tipo },
      select: CAMPOS_IMPORTACAO,
    });
  }

  /**
   * T-066a: a importação do cupom fiscal ainda esperando confirmação (ler o mesmo QR de novo mostra o
   * mesmo cartão, em vez de abrir outro).
   */
  importacaoPendenteDaNota(usuarioId: string, notaId: string): Promise<ImportacaoSalva | null> {
    return this.prisma.cliente.importacaoDocumento.findFirst({
      where: {
        usuarioId,
        tipo: 'nfce',
        status: 'aguardando_confirmacao',
        resultado: { path: ['notaNfceId'], equals: notaId },
      },
      orderBy: { criadoEm: 'desc' },
      select: CAMPOS_IMPORTACAO,
    });
  }

  async salvarImportacao(id: string, status: StatusImportacao, resultado: object): Promise<void> {
    await this.prisma.cliente.importacaoDocumento.update({
      where: { id },
      data: { status, resultado: resultado as Prisma.InputJsonObject },
      select: { id: true },
    });
  }

  /**
   * Muda a importação com ela travada (`FOR UPDATE`): dois toques ao mesmo tempo não pegam o mesmo
   * lançamento. `mudar` recebe a importação e devolve o novo estado e o retorno. `null`: não é do
   * usuário.
   */
  async alterarImportacao<T>(
    usuarioId: string,
    id: string,
    mudar: (atual: ImportacaoSalva) => {
      status: StatusImportacao;
      resultado: object;
      retorno: T;
    },
  ): Promise<{ retorno: T } | null> {
    return this.prisma.cliente.$transaction(async (tx) => {
      const travadas = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM importacoes_documento
        WHERE id = ${id}::uuid AND usuario_id = ${usuarioId}::uuid
        FOR UPDATE`;
      if (travadas.length === 0) return null;
      const atual = await tx.importacaoDocumento.findUniqueOrThrow({
        where: { id },
        select: CAMPOS_IMPORTACAO,
      });
      const { status, resultado, retorno } = mudar(atual);
      await tx.importacaoDocumento.update({
        where: { id },
        data: { status, resultado: resultado as Prisma.InputJsonObject },
        select: { id: true },
      });
      return { retorno };
    });
  }
}
