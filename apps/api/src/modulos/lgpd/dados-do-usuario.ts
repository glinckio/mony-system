import type { ClientePrisma } from '../../core/prisma/cliente';

type Consulta = (banco: ClientePrisma, usuarioId: string) => Promise<object[]>;

/**
 * RN-160: as tabelas que entram na exportação dos dados, pelo nome no banco, e como ler as linhas
 * de uma pessoa. Ficam de fora só hashes, tokens e segredos (`omit`). Toda tabela com
 * `usuario_id` está aqui ou em `TABELAS_FORA_DA_EXPORTACAO`; um teste confere o schema.
 */
export const TABELAS_EXPORTADAS = {
  usuarios: (banco, id) =>
    banco.usuario.findMany({ where: { id }, omit: { senhaHash: true, totpSegredo: true } }),
  aceites_termos: (banco, id) =>
    banco.aceiteTermos.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  consentimentos: (banco, id) =>
    banco.consentimento.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  logins_sociais: (banco, id) =>
    banco.loginSocial.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  dispositivos: (banco, id) =>
    banco.dispositivo.findMany({
      where: { usuarioId: id },
      omit: { tokenPush: true },
      orderBy: { id: 'asc' },
    }),
  sessoes: (banco, id) =>
    banco.sessao.findMany({
      where: { usuarioId: id },
      omit: { refreshTokenHash: true },
      orderBy: { id: 'asc' },
    }),
  acessos_diarios: (banco, id) =>
    banco.acessoDiario.findMany({ where: { usuarioId: id }, orderBy: { dia: 'asc' } }),
  assinaturas: (banco, id) =>
    banco.assinatura.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  uso_recursos: (banco, id) =>
    banco.usoRecurso.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  categorias: (banco, id) =>
    banco.categoria.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  contas: (banco, id) => banco.conta.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  cartoes: (banco, id) =>
    banco.cartao.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  faturas: (banco, id) =>
    banco.fatura.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  transacoes: (banco, id) =>
    banco.transacao.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  recorrencias: (banco, id) =>
    banco.recorrencia.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  parcelamentos: (banco, id) =>
    banco.parcelamento.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  parcelas: (banco, id) =>
    banco.parcela.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  anexos: (banco, id) => banco.anexo.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  importacoes_documento: (banco, id) =>
    banco.importacaoDocumento.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  nfce_notas: (banco, id) =>
    banco.nfceNota.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  nfce_itens: (banco, id) =>
    banco.nfceItem.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  orcamentos: (banco, id) =>
    banco.orcamento.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  metas: (banco, id) => banco.meta.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  metas_aportes: (banco, id) =>
    banco.metaAporte.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  listas_compras: (banco, id) =>
    banco.listaCompras.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  itens_lista: (banco, id) =>
    banco.itemLista.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  // Os que a pessoa fez e os convites que recebeu.
  compartilhamentos: (banco, id) =>
    banco.compartilhamento.findMany({
      where: { OR: [{ usuarioId: id }, { convidadoId: id }] },
      orderBy: { id: 'asc' },
    }),
  lembretes: (banco, id) =>
    banco.lembrete.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  ligacoes: (banco, id) =>
    banco.ligacao.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  agendas_conectadas: (banco, id) =>
    banco.agendaConectada.findMany({
      where: { usuarioId: id },
      omit: { tokensCifrados: true },
      orderBy: { id: 'asc' },
    }),
  compromissos: (banco, id) =>
    banco.compromisso.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  notificacoes: (banco, id) =>
    banco.notificacao.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  preferencias_alerta: (banco, id) =>
    banco.preferenciaAlerta.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  apps_monitorados: (banco, id) =>
    banco.appMonitorado.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  conexoes_open_finance: (banco, id) =>
    banco.conexaoOpenFinance.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  conversas: (banco, id) =>
    banco.conversa.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  mensagens: (banco, id) =>
    banco.mensagem.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  rascunhos_lancamento: (banco, id) =>
    banco.rascunhoLancamento.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  preferencias_aprendidas: (banco, id) =>
    banco.preferenciaAprendida.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  logs_ia: (banco, id) =>
    banco.logIa.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  novidades_leituras: (banco, id) =>
    banco.novidadeLeitura.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  dicas_vistas: (banco, id) =>
    banco.dicaVista.findMany({ where: { usuarioId: id }, orderBy: { id: 'asc' } }),
  exportacoes_relatorio: (banco, id) =>
    banco.exportacaoRelatorio.findMany({
      where: { usuarioId: id },
      omit: { chaveArquivo: true },
      orderBy: { id: 'asc' },
    }),
  exportacoes_dados: (banco, id) =>
    banco.exportacaoDados.findMany({
      where: { usuarioId: id },
      omit: { chaveArquivo: true },
      orderBy: { id: 'asc' },
    }),
} as const satisfies Record<string, Consulta>;

/** Tabelas com `usuario_id` que não entram, e por quê. */
export const TABELAS_FORA_DA_EXPORTACAO = {
  codigos_recuperacao: 'Códigos de uso único da recuperação de senha; só o hash, de vida curta.',
  auditoria: 'Registro de segurança das ações dos administradores no painel.',
} as const;

export type NomeTabelaExportada = keyof typeof TABELAS_EXPORTADAS;
