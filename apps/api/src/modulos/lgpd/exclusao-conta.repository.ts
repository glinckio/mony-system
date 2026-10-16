import { Injectable } from '@nestjs/common';

import type { ClientePrisma } from '../../core/prisma/cliente';
import { PrismaService } from '../../core/prisma/prisma.service';

type Transacao = Parameters<Parameters<ClientePrisma['$transaction']>[0]>[0];
type Apagar = (tx: Transacao, usuarioId: string) => Promise<unknown>;

/**
 * RN-161: as tabelas apagadas na exclusão definitiva, pelo nome no banco, **na ordem**: os
 * lançamentos, as recorrências e os parcelamentos saem antes das categorias, cartões e faturas que
 * eles prendem (`onDelete: Restrict`). Toda tabela com `usuario_id` está aqui ou em
 * `TABELAS_MANTIDAS_NA_EXCLUSAO`; um teste confere o schema.
 */
export const TABELAS_APAGADAS = {
  transacoes: (tx, id) => tx.transacao.deleteMany({ where: { usuarioId: id } }),
  recorrencias: (tx, id) => tx.recorrencia.deleteMany({ where: { usuarioId: id } }),
  parcelas: (tx, id) => tx.parcela.deleteMany({ where: { usuarioId: id } }),
  parcelamentos: (tx, id) => tx.parcelamento.deleteMany({ where: { usuarioId: id } }),
  faturas: (tx, id) => tx.fatura.deleteMany({ where: { usuarioId: id } }),
  cartoes: (tx, id) => tx.cartao.deleteMany({ where: { usuarioId: id } }),
  orcamentos: (tx, id) => tx.orcamento.deleteMany({ where: { usuarioId: id } }),
  categorias: (tx, id) => tx.categoria.deleteMany({ where: { usuarioId: id } }),
  contas: (tx, id) => tx.conta.deleteMany({ where: { usuarioId: id } }),
  conexoes_open_finance: (tx, id) => tx.conexaoOpenFinance.deleteMany({ where: { usuarioId: id } }),
  mensagens: (tx, id) => tx.mensagem.deleteMany({ where: { usuarioId: id } }),
  rascunhos_lancamento: (tx, id) => tx.rascunhoLancamento.deleteMany({ where: { usuarioId: id } }),
  conversas: (tx, id) => tx.conversa.deleteMany({ where: { usuarioId: id } }),
  preferencias_aprendidas: (tx, id) =>
    tx.preferenciaAprendida.deleteMany({ where: { usuarioId: id } }),
  anexos: (tx, id) => tx.anexo.deleteMany({ where: { usuarioId: id } }),
  importacoes_documento: (tx, id) =>
    tx.importacaoDocumento.deleteMany({ where: { usuarioId: id } }),
  nfce_itens: (tx, id) => tx.nfceItem.deleteMany({ where: { usuarioId: id } }),
  nfce_notas: (tx, id) => tx.nfceNota.deleteMany({ where: { usuarioId: id } }),
  metas_aportes: (tx, id) => tx.metaAporte.deleteMany({ where: { usuarioId: id } }),
  metas: (tx, id) => tx.meta.deleteMany({ where: { usuarioId: id } }),
  itens_lista: (tx, id) => tx.itemLista.deleteMany({ where: { usuarioId: id } }),
  listas_compras: (tx, id) => tx.listaCompras.deleteMany({ where: { usuarioId: id } }),
  // Os que a pessoa fez e os convites que recebeu.
  compartilhamentos: (tx, id) =>
    tx.compartilhamento.deleteMany({ where: { OR: [{ usuarioId: id }, { convidadoId: id }] } }),
  lembretes: (tx, id) => tx.lembrete.deleteMany({ where: { usuarioId: id } }),
  ligacoes: (tx, id) => tx.ligacao.deleteMany({ where: { usuarioId: id } }),
  compromissos: (tx, id) => tx.compromisso.deleteMany({ where: { usuarioId: id } }),
  agendas_conectadas: (tx, id) => tx.agendaConectada.deleteMany({ where: { usuarioId: id } }),
  notificacoes: (tx, id) => tx.notificacao.deleteMany({ where: { usuarioId: id } }),
  preferencias_alerta: (tx, id) => tx.preferenciaAlerta.deleteMany({ where: { usuarioId: id } }),
  apps_monitorados: (tx, id) => tx.appMonitorado.deleteMany({ where: { usuarioId: id } }),
  novidades_leituras: (tx, id) => tx.novidadeLeitura.deleteMany({ where: { usuarioId: id } }),
  dicas_vistas: (tx, id) => tx.dicaVista.deleteMany({ where: { usuarioId: id } }),
  uso_recursos: (tx, id) => tx.usoRecurso.deleteMany({ where: { usuarioId: id } }),
  exportacoes_relatorio: (tx, id) =>
    tx.exportacaoRelatorio.deleteMany({ where: { usuarioId: id } }),
  exportacoes_dados: (tx, id) => tx.exportacaoDados.deleteMany({ where: { usuarioId: id } }),
  codigos_recuperacao: (tx, id) => tx.codigoRecuperacao.deleteMany({ where: { usuarioId: id } }),
  sessoes: (tx, id) => tx.sessao.deleteMany({ where: { usuarioId: id } }),
  dispositivos: (tx, id) => tx.dispositivo.deleteMany({ where: { usuarioId: id } }),
  logins_sociais: (tx, id) => tx.loginSocial.deleteMany({ where: { usuarioId: id } }),
} as const satisfies Record<string, Apagar>;

/** RN-161: tabelas com `usuario_id` que ficam depois da exclusão definitiva, e por quê. */
export const TABELAS_MANTIDAS_NA_EXCLUSAO = {
  usuarios:
    'A linha fica, anonimizada (sem nome, e-mail, telefone, senha nem foto) e com status excluido: o id ainda é referência dos registros abaixo.',
  assinaturas:
    'Histórico de cobrança (obrigação fiscal) e métricas de MRR; só plano, datas e os ids da Stripe.',
  acessos_diarios: 'Métricas de uso do painel; só o dia do acesso.',
  logs_ia: 'Custo da IA no painel; só modelo, tokens e duração, sem o texto da conversa.',
  auditoria: 'Registro de segurança das ações no painel.',
  aceites_termos: 'Prova de quais termos foram aceitos e quando (LGPD, art. 37).',
  consentimentos: 'Prova dos consentimentos dados e revogados (LGPD, art. 8º).',
} as const;

/** A conta e o pedido de exclusão, para conferir a senha, avisar e decidir. */
export interface ContaParaExclusao {
  id: string;
  nome: string;
  email: string;
  senhaHash: string | null;
  status: 'ativo' | 'bloqueado' | 'excluido';
  fusoHorario: string;
  exclusaoAgendadaPara: Date | null;
  exclusaoCancelouAssinatura: boolean;
}

/** Até quantas contas vencidas a rotina põe na fila de uma vez. */
const LOTE_VENCIDAS = 500;

/** Exclusão da conta no banco (RN-161, T-140b). */
@Injectable()
export class ExclusaoContaRepository {
  constructor(private readonly prisma: PrismaService) {}

  conta(usuarioId: string): Promise<ContaParaExclusao | null> {
    return this.prisma.cliente.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        email: true,
        senhaHash: true,
        status: true,
        fusoHorario: true,
        exclusaoAgendadaPara: true,
        exclusaoCancelouAssinatura: true,
      },
    });
  }

  /** Agenda a exclusão e encerra as sessões de todos os aparelhos, numa transação. */
  async agendar(
    usuarioId: string,
    para: Date,
    cancelouAssinatura: boolean,
    agora: Date,
  ): Promise<void> {
    await this.prisma.cliente.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { exclusaoAgendadaPara: para, exclusaoCancelouAssinatura: cancelouAssinatura },
      });
      await tx.sessao.updateMany({
        where: { usuarioId, revogadaEm: null },
        data: { revogadaEm: agora },
      });
    });
  }

  /** Tira o pedido de exclusão. `false` se não havia pedido (ou a exclusão já aconteceu). */
  async desistir(usuarioId: string): Promise<boolean> {
    const { count } = await this.prisma.cliente.usuario.updateMany({
      where: { id: usuarioId, status: { not: 'excluido' }, exclusaoAgendadaPara: { not: null } },
      data: { exclusaoAgendadaPara: null, exclusaoCancelouAssinatura: false },
    });
    return count > 0;
  }

  /** As contas cuja exclusão já venceu e ainda não aconteceu. */
  async vencidas(agora: Date): Promise<string[]> {
    const linhas = await this.prisma.cliente.usuario.findMany({
      where: { status: { not: 'excluido' }, exclusaoAgendadaPara: { lte: agora } },
      select: { id: true },
      orderBy: { exclusaoAgendadaPara: 'asc' },
      take: LOTE_VENCIDAS,
    });
    return linhas.map(({ id }) => id);
  }

  /** As chaves no S3 dos arquivos da pessoa: anexos (fotos, áudios, documentos) e exportações. */
  async chavesDeArquivos(usuarioId: string): Promise<string[]> {
    const [anexos, relatorios, dados] = await Promise.all([
      this.prisma.cliente.anexo.findMany({ where: { usuarioId }, select: { arquivoUrl: true } }),
      this.prisma.cliente.exportacaoRelatorio.findMany({
        where: { usuarioId, chaveArquivo: { not: null } },
        select: { chaveArquivo: true },
      }),
      this.prisma.cliente.exportacaoDados.findMany({
        where: { usuarioId, chaveArquivo: { not: null } },
        select: { chaveArquivo: true },
      }),
    ]);
    return [
      ...anexos.map(({ arquivoUrl }) => arquivoUrl),
      ...[...relatorios, ...dados].flatMap(({ chaveArquivo }) =>
        chaveArquivo === null ? [] : [chaveArquivo],
      ),
    ];
  }

  /**
   * Apaga os dados e anonimiza a conta, numa transação. Confere de novo, dentro dela, que a
   * exclusão está vencida: quem desistiu no último instante fica com tudo. Devolve se excluiu.
   */
  apagar(usuarioId: string, agora: Date): Promise<boolean> {
    return this.prisma.cliente.$transaction(
      async (tx) => {
        const { count } = await tx.usuario.updateMany({
          where: {
            id: usuarioId,
            status: { not: 'excluido' },
            exclusaoAgendadaPara: { lte: agora },
          },
          data: {
            status: 'excluido',
            papel: 'usuario',
            nome: 'Conta excluída',
            email: `excluida-${usuarioId}@excluida.invalid`,
            telefone: null,
            telefoneVerificadoEm: null,
            senhaHash: null,
            fotoUrl: null,
            totpSegredo: null,
            totpAtivadoEm: null,
            exclusaoCancelouAssinatura: false,
          },
        });
        if (count === 0) return false;
        for (const apagar of Object.values(TABELAS_APAGADAS)) await apagar(tx, usuarioId);
        return true;
      },
      { timeout: 120_000 },
    );
  }
}
