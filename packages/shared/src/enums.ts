/**
 * Enums do modelo de dados (docs/arquitetura/06 e 07). Valores em minúsculas, português, sem
 * acento (doc 03). Cada enum é uma lista `as const` e um tipo derivado dela, para servir tanto à
 * validação em tempo de execução (Zod, Prisma) quanto aos tipos.
 *
 * Os mesmos valores existem como enums do Postgres no schema do Prisma (`apps/api`); um teste da
 * API confere que as duas listas são iguais. Valores marcados "decisão técnica" não estão nos docs
 * de arquitetura e foram definidos na T-007 (ver docs/agentes/DECISOES.md).
 */

// Conta e assinatura

export const PAPEIS_USUARIO = ['usuario', 'admin'] as const;
export type PapelUsuario = (typeof PAPEIS_USUARIO)[number];

export const STATUS_USUARIO = ['ativo', 'bloqueado', 'excluido'] as const;
export type StatusUsuario = (typeof STATUS_USUARIO)[number];

export const PROVEDORES_LOGIN_SOCIAL = ['google', 'apple'] as const;
export type ProvedorLoginSocial = (typeof PROVEDORES_LOGIN_SOCIAL)[number];

/** Decisão técnica. */
export const PLATAFORMAS_DISPOSITIVO = ['ios', 'android'] as const;
export type PlataformaDispositivo = (typeof PLATAFORMAS_DISPOSITIVO)[number];

export const PLANOS = ['teste', 'gratuito', 'mensal', 'anual'] as const;
export type Plano = (typeof PLANOS)[number];

/** Planos com preço (`planos_precos.plano`). */
export const PLANOS_PAGOS = ['mensal', 'anual'] as const;
export type PlanoPago = (typeof PLANOS_PAGOS)[number];

/**
 * Situação da cobrança; o plano (teste, gratuito, mensal, anual) fica em `Plano`. Decisão técnica,
 * a partir dos grupos do painel admin (doc 13): ativas, inadimplentes, canceladas.
 */
export const STATUS_ASSINATURA = ['ativa', 'inadimplente', 'cancelada'] as const;
export type StatusAssinatura = (typeof STATUS_ASSINATURA)[number];

/** Recursos com limite no plano gratuito (RN-120). */
export const RECURSOS_PLANO = [
  'lancamento',
  'mensagem_mony',
  'leitura_documento',
  'cartao',
  'lista_compras',
  'lembrete_ativo',
  'relatorio',
] as const;
export type RecursoPlano = (typeof RECURSOS_PLANO)[number];

// Finanças

export const TIPOS_CATEGORIA = ['receita', 'despesa'] as const;
export type TipoCategoria = (typeof TIPOS_CATEGORIA)[number];

export const TIPOS_TRANSACAO = ['receita', 'despesa'] as const;
export type TipoTransacao = (typeof TIPOS_TRANSACAO)[number];

export const TIPOS_CONTA = ['corrente', 'poupanca', 'carteira'] as const;
export type TipoConta = (typeof TIPOS_CONTA)[number];

/** Origem de contas e cartões. */
export const ORIGENS_CONTA = ['manual', 'open_finance'] as const;
export type OrigemConta = (typeof ORIGENS_CONTA)[number];

/** RN-033 */
export const STATUS_FATURA = ['aberta', 'fechada', 'paga', 'parcial', 'atrasada'] as const;
export type StatusFatura = (typeof STATUS_FATURA)[number];

/** RN-040 */
export const STATUS_TRANSACAO = ['pago', 'pendente'] as const;
export type StatusTransacao = (typeof STATUS_TRANSACAO)[number];

/** RN-040 */
export const FORMAS_PAGAMENTO = ['cartao_credito', 'pix', 'debito', 'dinheiro', 'boleto'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const ORIGENS_TRANSACAO = ['manual', 'mony', 'open_finance', 'foto'] as const;
export type OrigemTransacao = (typeof ORIGENS_TRANSACAO)[number];

/** `pagamento_fatura` não entra em totais de despesa (RN-037). */
export const NATUREZAS_TRANSACAO = ['normal', 'pagamento_fatura', 'transferencia'] as const;
export type NaturezaTransacao = (typeof NATUREZAS_TRANSACAO)[number];

/** RN-043 */
export const FREQUENCIAS_RECORRENCIA = ['semanal', 'mensal', 'anual'] as const;
export type FrequenciaRecorrencia = (typeof FREQUENCIAS_RECORRENCIA)[number];

export const TIPOS_PARCELAMENTO = ['compra_cartao', 'divida'] as const;
export type TipoParcelamento = (typeof TIPOS_PARCELAMENTO)[number];

/** RN-054 */
export const STATUS_PARCELAMENTO = ['ativa', 'quitada', 'atrasada', 'cancelada'] as const;
export type StatusParcelamento = (typeof STATUS_PARCELAMENTO)[number];

export const STATUS_PARCELA = ['pendente', 'pago', 'atrasado'] as const;
export type StatusParcela = (typeof STATUS_PARCELA)[number];

export const TIPOS_ANEXO = ['foto', 'pdf', 'comprovante'] as const;
export type TipoAnexo = (typeof TIPOS_ANEXO)[number];

// Planejamento

/** RN-070 */
export const CATEGORIAS_LISTA = ['mercado', 'casa', 'carro', 'farmacia', 'outra'] as const;
export type CategoriaLista = (typeof CATEGORIAS_LISTA)[number];

export const RECURSOS_COMPARTILHAVEIS = ['lista', 'lembrete'] as const;
export type RecursoCompartilhavel = (typeof RECURSOS_COMPARTILHAVEIS)[number];

/** RN-074 */
export const PERMISSOES_COMPARTILHAMENTO = ['ver', 'editar'] as const;
export type PermissaoCompartilhamento = (typeof PERMISSOES_COMPARTILHAMENTO)[number];

/** Decisão técnica. */
export const STATUS_CONVITE = ['pendente', 'aceito', 'recusado'] as const;
export type StatusConvite = (typeof STATUS_CONVITE)[number];

// Lembretes e agenda

/** RN-075 */
export const CANAIS_LEMBRETE = ['push', 'alarme', 'ligacao'] as const;
export type CanalLembrete = (typeof CANAIS_LEMBRETE)[number];

/** Decisão técnica; o índice de lembretes do doc 06 usa `status = 'ativo'`. */
export const STATUS_LEMBRETE = ['ativo', 'concluido', 'cancelado'] as const;
export type StatusLembrete = (typeof STATUS_LEMBRETE)[number];

export const PROVEDORES_AGENDA = ['google', 'outlook', 'aparelho'] as const;
export type ProvedorAgenda = (typeof PROVEDORES_AGENDA)[number];

/** Compromisso criado no app ou pela Mony (editável) ou vindo da agenda externa (só leitura, RN-079). Decisão técnica. */
export const ORIGENS_COMPROMISSO = ['app', 'mony', 'externo'] as const;
export type OrigemCompromisso = (typeof ORIGENS_COMPROMISSO)[number];

// Alertas e notificações

/** Tipos de alerta e de notificação (doc 09). */
export const TIPOS_ALERTA = [
  'limite_cartao',
  'fatura_fechada',
  'fatura_vencimento',
  'fatura_atrasada',
  'orcamento',
  'gasto_fora_padrao',
  'projecao_mes',
  'vencimento_pendente',
  'app_compra',
  'lembrete',
  'compromisso',
  'resumo_periodo',
  'open_finance',
  'assinatura',
  'novidade',
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

// Open Finance

/** Doc 10. */
export const STATUS_CONEXAO_OPEN_FINANCE = [
  'ativa',
  'atualizando',
  'erro_login',
  'consentimento_expirado',
  'desconectada',
] as const;
export type StatusConexaoOpenFinance = (typeof STATUS_CONEXAO_OPEN_FINANCE)[number];

// Mony

export const AUTORES_MENSAGEM = ['usuario', 'mony'] as const;
export type AutorMensagem = (typeof AUTORES_MENSAGEM)[number];

export const TIPOS_MENSAGEM = ['texto', 'audio', 'imagem', 'pdf', 'botao'] as const;
export type TipoMensagem = (typeof TIPOS_MENSAGEM)[number];

/** Documento lido pela Mony com vários lançamentos aguardando confirmação (RN-083). Decisão técnica. */
export const TIPOS_IMPORTACAO = ['foto', 'pdf'] as const;
export type TipoImportacao = (typeof TIPOS_IMPORTACAO)[number];

/** Decisão técnica. */
export const STATUS_IMPORTACAO = [
  'processando',
  'aguardando_confirmacao',
  'confirmada',
  'descartada',
  'erro',
] as const;
export type StatusImportacao = (typeof STATUS_IMPORTACAO)[number];

// Administração e integrações

/** Decisão técnica. */
export const STATUS_NOVIDADE = ['rascunho', 'publicada', 'arquivada'] as const;
export type StatusNovidade = (typeof STATUS_NOVIDADE)[number];

/** Origem dos webhooks registrados em `webhook_eventos` (doc 05). */
export const PROVEDORES_WEBHOOK = ['stripe', 'open_finance'] as const;
export type ProvedorWebhook = (typeof PROVEDORES_WEBHOOK)[number];

// LGPD e controle do teste (tabelas propostas no doc 06)

export const DOCUMENTOS_ACEITE = ['termos', 'privacidade'] as const;
export type DocumentoAceite = (typeof DOCUMENTOS_ACEITE)[number];

export const FINALIDADES_CONSENTIMENTO = [
  'open_finance',
  'agenda',
  'apps_compra',
  'ligacao',
] as const;
export type FinalidadeConsentimento = (typeof FINALIDADES_CONSENTIMENTO)[number];

/** RN-125 */
export const TIPOS_CONTROLE_TESTE = ['email', 'google', 'apple', 'aparelho'] as const;
export type TipoControleTeste = (typeof TIPOS_CONTROLE_TESTE)[number];

// Contexto dos Services (doc 05)

/** Quem originou a chamada ao Service. */
export const ORIGENS_CONTEXTO = ['app', 'mony', 'open_finance', 'admin', 'sistema'] as const;
export type OrigemContexto = (typeof ORIGENS_CONTEXTO)[number];
