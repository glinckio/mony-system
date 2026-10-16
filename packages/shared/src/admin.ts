/**
 * Login do painel admin (T-104a, docs/arquitetura/11 e 13): e-mail e senha de quem tem papel
 * `admin` e, depois, o código do 2FA (TOTP) do aplicativo autenticador.
 */
import { z } from 'zod';

import { SENHA_MAXIMO } from './autenticacao.js';
import { ehDataCalendario } from './datas.js';
import {
  ORIGENS_TRANSACAO,
  type OrigemTransacao,
  PAPEIS_USUARIO,
  PLANOS,
  PLANOS_PAGOS,
  PLATAFORMAS_DISPOSITIVO,
  PROVEDORES_LOGIN_SOCIAL,
  type RecursoPlano,
  STATUS_ASSINATURA,
  STATUS_CONEXAO_OPEN_FINANCE,
  STATUS_USUARIO,
  TIPOS_ALERTA,
} from './enums.js';

/** `POST /admin/auth/entrar`. */
export const esquemaLoginAdmin = z.object({
  email: z.email().max(254),
  senha: z.string().min(1).max(SENHA_MAXIMO),
});

/**
 * Senha certa: o desafio (5 minutos), que vai no `Authorization: Bearer` das rotas do 2FA. Sem
 * 2FA configurado, o painel pede o segredo novo (`POST /admin/auth/2fa/novo`) antes do código.
 */
export const esquemaDesafioAdmin = z.object({
  desafio: z.string(),
  expiraEm: z.string(),
  configurar2fa: z.boolean(),
});

/** `POST /admin/auth/2fa/novo`: o segredo em base32 e o `otpauth://` do QR Code. */
export const esquemaNovo2fa = z.object({
  segredo: z.string(),
  endereco: z.string(),
});

/** `POST /admin/auth/2fa`: os 6 dígitos do aplicativo autenticador. */
export const esquemaCodigo2fa = z.object({
  codigo: z.string().regex(/^\d{6}$/),
});

export const esquemaAdmin = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
});

/**
 * A sessão do painel: token de 15 minutos, renovado por `POST /admin/auth/renovar` até 8 horas
 * depois do login. Guardar só em memória ou na `sessionStorage`.
 */
export const esquemaSessaoAdmin = z.object({
  admin: esquemaAdmin,
  token: z.string(),
  expiraEm: z.string(),
});

/** Valor de um plano no painel: de R$ 1,00 a R$ 10.000,00, em centavos. */
export const PRECO_MINIMO_CENTAVOS = 100;
export const PRECO_MAXIMO_CENTAVOS = 1_000_000;

/** `POST /admin/planos/precos` (T-104b, RN-129): o valor novo de um plano. */
export const esquemaNovoPreco = z.object({
  plano: z.enum(PLANOS_PAGOS),
  valorCentavos: z.number().int().min(PRECO_MINIMO_CENTAVOS).max(PRECO_MAXIMO_CENTAVOS),
});

/** Um preço da tabela `planos_precos`, com quem o criou (`null`: o script de configuração). */
export const esquemaPrecoAdmin = z.object({
  id: z.uuid(),
  plano: z.enum(PLANOS_PAGOS),
  valorCentavos: z.number().int(),
  vigente: z.boolean(),
  vigenteDesde: z.string(),
  alteradoPor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
});

/**
 * `GET /admin/planos/precos`: o vigente de cada plano e o histórico, do mais novo ao mais antigo.
 * Assinaturas pagas continuam no preço em que entraram (RN-129).
 */
export const esquemaPrecosAdmin = z.object({
  vigentes: z.array(esquemaPrecoAdmin),
  historico: z.array(esquemaPrecoAdmin),
});

/** Recursos do gratuito que contam uso por dia ou por mês (RN-120). */
export const RECURSOS_DE_USO = [
  'lancamento',
  'mensagem_mony',
  'leitura_documento',
] as const satisfies readonly RecursoPlano[];
/** Recursos do gratuito que contam os itens que existem (RN-120). */
export const RECURSOS_DE_QUANTIDADE = [
  'cartao',
  'lista_compras',
  'lembrete_ativo',
] as const satisfies readonly RecursoPlano[];

export const DURACAO_TESTE_MINIMA_DIAS = 1;
export const DURACAO_TESTE_MAXIMA_DIAS = 30;
/** Limite de um recurso no painel: um número de 0 a 10.000, ou `null` para "sem limite". */
export const LIMITE_MAXIMO = 10_000;

const limite = z.number().int().min(0).max(LIMITE_MAXIMO).nullable();

/** Um limite de uso: por dia e por mês (o `relatorio` não tem número, a regra está no código). */
export const esquemaLimiteDeUso = z.object({
  recurso: z.enum(RECURSOS_DE_USO),
  limiteDia: limite,
  limiteMes: limite,
});

/** Um limite de quantidade: quantos itens a pessoa pode ter. */
export const esquemaLimiteDeQuantidade = z.object({
  recurso: z.enum(RECURSOS_DE_QUANTIDADE),
  limiteQuantidade: limite,
});

/**
 * `GET` e `PUT /admin/planos/gratuito` (T-104c): os limites do plano gratuito (RN-120), que valem
 * na hora, e a duração do teste grátis, que vale para quem se cadastrar depois (RN-006). O `PUT`
 * recebe todos os recursos de uma vez.
 */
export const esquemaPlanoGratuitoAdmin = z.object({
  duracaoTesteDias: z.number().int().min(DURACAO_TESTE_MINIMA_DIAS).max(DURACAO_TESTE_MAXIMA_DIAS),
  limitesDeUso: z
    .array(esquemaLimiteDeUso)
    .length(RECURSOS_DE_USO.length)
    .refine((itens) => new Set(itens.map((item) => item.recurso)).size === itens.length, {
      message: 'Um item por recurso',
    }),
  limitesDeQuantidade: z
    .array(esquemaLimiteDeQuantidade)
    .length(RECURSOS_DE_QUANTIDADE.length)
    .refine((itens) => new Set(itens.map((item) => item.recurso)).size === itens.length, {
      message: 'Um item por recurso',
    }),
});

/**
 * Código do cupom (RN-130, T-104d): o que a pessoa digita em "Adicionar código promocional" na
 * página de pagamento da Stripe. Letras e números, como a Stripe aceita; o painel grava em
 * maiúsculas (a Stripe não diferencia).
 */
export const PADRAO_CODIGO_CUPOM = /^[A-Za-z0-9]{3,20}$/;
export const PERCENTUAL_CUPOM_MINIMO = 1;
export const PERCENTUAL_CUPOM_MAXIMO = 100;

/**
 * `POST /admin/cupons`: desconto em percentual na primeira cobrança da assinatura. `validade` é o
 * último dia em que o código vale (fuso de São Paulo); `null`, sem prazo.
 */
export const esquemaNovoCupom = z.object({
  codigo: z.string().regex(PADRAO_CODIGO_CUPOM),
  percentual: z.number().int().min(PERCENTUAL_CUPOM_MINIMO).max(PERCENTUAL_CUPOM_MAXIMO),
  validade: z
    .string()
    .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' })
    .nullable(),
});

/** `ativo` vale no pagamento; `vencido` passou da validade; `desativado` foi tirado pelo painel. */
export const SITUACOES_CUPOM = ['ativo', 'vencido', 'desativado'] as const;

export const esquemaCupomAdmin = z.object({
  id: z.uuid(),
  codigo: z.string(),
  percentual: z.number().int(),
  validade: z.string().nullable(),
  situacao: z.enum(SITUACOES_CUPOM),
  criadoEm: z.string(),
  criadoPor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
});

/** `GET /admin/cupons`: do mais novo ao mais antigo. */
export const esquemaCuponsAdmin = z.array(esquemaCupomAdmin);

/** Quantas pessoas a busca do painel devolve de uma vez, no máximo. */
export const LIMITE_PAGINA_USUARIOS_ADMIN = 100;

/**
 * `GET /admin/usuarios` (T-141a): busca por nome, e-mail ou telefone (parte do texto, sem
 * diferenciar maiúsculas), das contas mais novas às mais antigas, com paginação por cursor.
 */
export const esquemaConsultaUsuariosAdmin = z.object({
  busca: z.string().trim().max(100).optional(),
  cursor: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA_USUARIOS_ADMIN).default(20),
});

export const esquemaUsuarioResumoAdmin = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  telefone: z.string().nullable(),
  status: z.enum(STATUS_USUARIO),
  papel: z.enum(PAPEIS_USUARIO),
  /** O plano que vale agora (o teste vencido já conta como gratuito). */
  plano: z.enum(PLANOS),
  criadoEm: z.string(),
  ultimoAcesso: z.string().nullable(),
});

export const esquemaUsuariosAdmin = z.object({
  itens: z.array(esquemaUsuarioResumoAdmin),
  proximoCursor: z.string().nullable(),
});

/** `GET /admin/usuarios/:id`: a conta, o plano, os aparelhos, as sessões e as conexões. */
export const esquemaUsuarioAdmin = esquemaUsuarioResumoAdmin.extend({
  fusoHorario: z.string(),
  assinatura: z
    .object({
      status: z.enum(STATUS_ASSINATURA),
      testeFim: z.string().nullable(),
      valorCentavos: z.number().int().nullable(),
      proximaCobranca: z.string().nullable(),
      cancelamentoAgendado: z.boolean(),
      clienteStripe: z.boolean(),
    })
    .nullable(),
  aparelhos: z.array(
    z.object({
      id: z.uuid(),
      plataforma: z.enum(PLATAFORMAS_DISPOSITIVO),
      modelo: z.string().nullable(),
      ultimoUso: z.string().nullable(),
      ativo: z.boolean(),
    }),
  ),
  sessoesAtivas: z.number().int(),
  loginsSociais: z.array(z.enum(PROVEDORES_LOGIN_SOCIAL)),
  conexoes: z.array(
    z.object({
      id: z.uuid(),
      instituicao: z.string(),
      status: z.enum(STATUS_CONEXAO_OPEN_FINANCE),
      criadoEm: z.string(),
    }),
  ),
});

export const DIAS_EXTENSAO_TESTE_MAXIMO = 30;

/**
 * `POST /admin/usuarios/:id/estender-teste`: soma dias ao teste grátis (a partir do fim atual, ou
 * de agora se já acabou). Só para quem não tem plano pago.
 */
export const esquemaEstenderTeste = z.object({
  dias: z.number().int().min(1).max(DIAS_EXTENSAO_TESTE_MAXIMO),
});

/**
 * Situações de assinatura do painel (T-141b, doc 13), uma por conta, seguindo o plano que vale agora:
 * - `teste`: teste grátis valendo;
 * - `ativa`: plano pago em dia;
 * - `inadimplente`: plano pago com cobrança recusada, enquanto a Stripe tenta de novo (RN-131);
 * - `cancelada`: o plano pago acabou (cancelado ou sem pagamento) e a pessoa voltou ao gratuito;
 * - `gratuito`: o resto, inclusive o teste vencido (RN-126) e quem nunca assinou.
 */
export const SITUACOES_ASSINATURA_ADMIN = [
  'teste',
  'gratuito',
  'ativa',
  'inadimplente',
  'cancelada',
] as const;

/** A conversão do teste olha os testes que acabaram nestes últimos dias. */
export const DIAS_CONVERSAO_TESTE = 30;

/** `GET /admin/assinaturas/resumo`: contas por situação, conversão do teste e MRR. */
export const esquemaResumoAssinaturasAdmin = z.object({
  situacoes: z.object({
    teste: z.number().int(),
    gratuito: z.number().int(),
    ativa: z.number().int(),
    inadimplente: z.number().int(),
    cancelada: z.number().int(),
  }),
  /** As ativas e as inadimplentes, por plano. */
  pagasPorPlano: z.object({ mensal: z.number().int(), anual: z.number().int() }),
  /** Ativas com o cancelamento marcado para o fim do período. */
  cancelamentoAgendado: z.number().int(),
  /** Receita mensal recorrente das ativas: o mensal mais um doze avos do anual, em centavos. */
  mrrCentavos: z.number().int(),
  /** A parte do MRR das inadimplentes, que pode se perder (fora do `mrrCentavos`). */
  mrrInadimplenteCentavos: z.number().int(),
  conversaoTeste: z.object({
    dias: z.number().int(),
    /** Testes que acabaram nos últimos `dias`. */
    encerrados: z.number().int(),
    /** Desses, os que assinaram um plano pago (mesmo que depois tenham cancelado). */
    convertidos: z.number().int(),
  }),
});

/** `GET /admin/assinaturas`: as contas de uma situação, das mais novas às mais antigas. */
export const esquemaConsultaAssinaturasAdmin = z.object({
  situacao: z.enum(SITUACOES_ASSINATURA_ADMIN),
  cursor: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA_USUARIOS_ADMIN).default(20),
});

export const esquemaAssinaturaResumoAdmin = z.object({
  usuarioId: z.uuid(),
  nome: z.string(),
  email: z.string(),
  situacao: z.enum(SITUACOES_ASSINATURA_ADMIN),
  /** O plano gravado (o pago que foi cancelado aparece como gratuito). Sem assinatura: `null`. */
  plano: z.enum(PLANOS).nullable(),
  valorCentavos: z.number().int().nullable(),
  testeFim: z.string().nullable(),
  proximaCobranca: z.string().nullable(),
  cancelamentoAgendado: z.boolean(),
  canceladaEm: z.string().nullable(),
});

export const esquemaAssinaturasAdmin = z.object({
  itens: z.array(esquemaAssinaturaResumoAdmin),
  proximoCursor: z.string().nullable(),
});

const dataDoFiltro = z
  .string()
  .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' });

/**
 * `GET /admin/auditoria` (T-141c): o registro das ações dos admins, da mais nova à mais antiga, com
 * filtros. `de` e `ate` são dias no fuso do painel (São Paulo), os dois inclusos.
 */
export const esquemaConsultaAuditoriaAdmin = z
  .object({
    adminId: z.uuid().optional(),
    acao: z.string().trim().min(1).max(60).optional(),
    entidade: z.string().trim().min(1).max(60).optional(),
    entidadeId: z.string().trim().min(1).max(100).optional(),
    de: dataDoFiltro.optional(),
    ate: dataDoFiltro.optional(),
    cursor: z.uuid().optional(),
    limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA_USUARIOS_ADMIN).default(50),
  })
  .refine((consulta) => !consulta.de || !consulta.ate || consulta.de <= consulta.ate, {
    message: 'O início do período não pode ser depois do fim.',
    path: ['de'],
  });

export const esquemaRegistroAuditoriaAdmin = z.object({
  id: z.uuid(),
  /** Quem fez a ação. `null`: a conta foi apagada. */
  admin: z.object({ id: z.uuid(), nome: z.string(), email: z.string() }).nullable(),
  acao: z.string(),
  entidade: z.string(),
  entidadeId: z.string().nullable(),
  antes: z.record(z.string(), z.unknown()).nullable(),
  depois: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().nullable(),
  criadoEm: z.string(),
});

export const esquemaAuditoriaAdmin = z.object({
  itens: z.array(esquemaRegistroAuditoriaAdmin),
  proximoCursor: z.string().nullable(),
});

/** `GET /admin/auditoria/filtros`: o que existe no registro, para as listas dos filtros. */
export const esquemaFiltrosAuditoriaAdmin = z.object({
  admins: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  acoes: z.array(z.string()),
  entidades: z.array(z.string()),
});

export const TITULO_NOVIDADE_MAXIMO = 120;
export const DESCRICAO_NOVIDADE_MAXIMO = 2000;

/** Vídeo das novidades: link do YouTube ou do Vimeo (doc 13; upload no S3 a confirmar). */
export const PADRAO_VIDEO_NOVIDADE =
  /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|vimeo\.com\/)[A-Za-z0-9_\-?=&/]+$/;

/**
 * A situação de uma novidade (T-141d): `rascunho` (ninguém vê), `agendada` (publicada para depois),
 * `no_ar`, `vencida` (passou da validade) e `desativada`.
 */
export const SITUACOES_NOVIDADE = [
  'rascunho',
  'agendada',
  'no_ar',
  'vencida',
  'desativada',
] as const;

/** `POST /admin/novidades` e `PUT /admin/novidades/:id`. `validade` é o último dia, em São Paulo. */
export const esquemaNovaNovidade = z.object({
  titulo: z.string().trim().min(1).max(TITULO_NOVIDADE_MAXIMO),
  descricao: z.string().trim().min(1).max(DESCRICAO_NOVIDADE_MAXIMO),
  videoUrl: z
    .string()
    .trim()
    .regex(PADRAO_VIDEO_NOVIDADE, { message: 'Use um link do YouTube ou do Vimeo.' })
    .nullable(),
  validade: z
    .string()
    .refine(ehDataCalendario, { message: 'Data de calendário no formato AAAA-MM-DD' })
    .nullable(),
  /** Manda push a todos quando a novidade entra no ar. */
  enviarPush: z.boolean(),
});

/** `POST /admin/novidades/:id/publicar`. Sem `publicarEm`, entra no ar agora. */
export const esquemaPublicarNovidade = z.object({
  publicarEm: z.iso.datetime({ offset: true }).nullable(),
});

export const esquemaNovidadeAdmin = z.object({
  id: z.uuid(),
  titulo: z.string(),
  descricao: z.string(),
  videoUrl: z.string().nullable(),
  /** O último dia, em São Paulo. */
  validade: z.string().nullable(),
  enviarPush: z.boolean(),
  pushEnviadoEm: z.string().nullable(),
  situacao: z.enum(SITUACOES_NOVIDADE),
  publicadaEm: z.string().nullable(),
  autor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  criadoEm: z.string(),
});

export const esquemaNovidadesAdmin = z.array(esquemaNovidadeAdmin);

/** Tamanho máximo do prompt do sistema de uma versão da Mony (T-141e). */
export const PROMPT_MONY_MAXIMO = 50_000;

/**
 * A avaliação de uma versão (T-141e, doc 08): `nunca` (não rodou), `em_andamento` (pedida, rodando
 * no worker), `falhou` (não terminou; vale o resultado anterior, se houver) e `concluida`.
 */
export const SITUACOES_AVALIACAO_MONY = ['nunca', 'em_andamento', 'falhou', 'concluida'] as const;

/** `POST /admin/mony/versoes`: a versão nova, inativa. Sem modelo, o do ambiente. */
export const esquemaNovaVersaoMony = z.object({
  promptSistema: z.string().trim().min(1).max(PROMPT_MONY_MAXIMO),
  /** A descrição de cada ferramenta que muda; as outras ficam com a do código. */
  descricoes: z.record(z.string(), z.string().trim().min(1).max(2000)),
  modelo: z.string().trim().min(1).max(100).nullable(),
});

export const esquemaResultadoAvaliacaoMony = z.object({
  total: z.number().int(),
  aprovados: z.number().int(),
  percentual: z.number().int(),
  modelo: z.string(),
  em: z.string(),
});

export const esquemaVersaoMonyResumoAdmin = z.object({
  versao: z.number().int(),
  ativa: z.boolean(),
  modelo: z.string(),
  criadoEm: z.string(),
  criadoPor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  situacaoAvaliacao: z.enum(SITUACOES_AVALIACAO_MONY),
  avaliacao: esquemaResultadoAvaliacaoMony.nullable(),
  /** Pode ativar: a avaliação chegou ao mínimo e a versão não é a ativa. */
  podeAtivar: z.boolean(),
});

/** `GET /admin/mony/versoes`: da mais nova à mais antiga. */
export const esquemaVersoesMonyAdmin = z.object({
  itens: z.array(esquemaVersaoMonyResumoAdmin),
  /** `null`: nenhuma ativa, vale o prompt do código. */
  versaoAtiva: z.number().int().nullable(),
  minimoAvaliacao: z.number().int(),
  /** Com o modelo falso (ambientes de teste), a avaliação não vale e o painel não a pede. */
  avaliacaoDisponivel: z.boolean(),
});

/** `GET /admin/mony/versoes/:versao`; a versão 0 é o prompt do código (o ponto de partida). */
export const esquemaVersaoMonyAdmin = esquemaVersaoMonyResumoAdmin.extend({
  promptSistema: z.string(),
  descricoes: z.record(z.string(), z.string()),
  avaliacaoFalha: z.string().nullable(),
  casos: z.array(z.object({ id: z.string(), passou: z.boolean(), motivos: z.array(z.string()) })),
});

/** `GET /admin/mony/logs`: as chamadas ao modelo que deram erro, da mais nova à mais antiga. */
export const esquemaConsultaLogsMonyAdmin = z
  .object({
    de: dataDoFiltro.optional(),
    ate: dataDoFiltro.optional(),
    cursor: z.uuid().optional(),
    limite: z.coerce.number().int().min(1).max(LIMITE_PAGINA_USUARIOS_ADMIN).default(50),
  })
  .refine((consulta) => !consulta.de || !consulta.ate || consulta.de <= consulta.ate, {
    message: 'O início do período não pode ser depois do fim.',
    path: ['de'],
  });

export const esquemaLogMonyAdmin = z.object({
  id: z.uuid(),
  usuario: z.object({ id: z.uuid(), nome: z.string(), email: z.string() }),
  modelo: z.string(),
  ferramenta: z.string().nullable(),
  duracaoMs: z.number().int(),
  erro: z.string(),
  /** A mensagem do usuário que levou à chamada, cortada; `null` sem mensagem ligada. */
  mensagem: z.string().nullable(),
  criadoEm: z.string(),
});

export const esquemaLogsMonyAdmin = z.object({
  itens: z.array(esquemaLogMonyAdmin),
  proximoCursor: z.string().nullable(),
});

/** O preço de um modelo, em centavos de dólar por milhão de tokens (a moeda do provedor). */
export const esquemaPrecoModeloIa = z.object({
  modelo: z.string().trim().min(1).max(100),
  entradaCentavosPorMilhao: z.number().int().min(0).max(1_000_000),
  saidaCentavosPorMilhao: z.number().int().min(0).max(1_000_000),
});

/** `PUT /admin/mony/precos` e `GET /admin/mony/precos`: a tabela inteira, um modelo por linha. */
export const esquemaPrecosIaAdmin = z.object({
  precos: z
    .array(esquemaPrecoModeloIa)
    .max(50)
    .refine((precos) => new Set(precos.map(({ modelo }) => modelo)).size === precos.length, {
      message: 'Cada modelo aparece uma vez.',
    }),
});

/** Um ano, contando o dia de início. */
export const DIAS_CUSTO_MONY_MAXIMO = 366;

/** `GET /admin/mony/custo`: o período (dias de São Paulo, os dois inclusos; até 1 ano). */
export const esquemaConsultaCustoMonyAdmin = z
  .object({ de: dataDoFiltro, ate: dataDoFiltro })
  .refine((consulta) => consulta.de <= consulta.ate, {
    message: 'O início do período não pode ser depois do fim.',
    path: ['de'],
  })
  .refine(
    (consulta) =>
      Date.parse(`${consulta.ate}T00:00:00Z`) - Date.parse(`${consulta.de}T00:00:00Z`) <
      DIAS_CUSTO_MONY_MAXIMO * 86_400_000,
    { message: 'O período vai até 1 ano.', path: ['ate'] },
  );

export const esquemaCustoModeloMony = z.object({
  modelo: z.string(),
  chamadas: z.number().int(),
  tokensEntrada: z.number().int(),
  tokensSaida: z.number().int(),
  /** Em centavos de dólar; `null`: o modelo não está na tabela de preços. */
  custoCentavos: z.number().int().nullable(),
});

export const esquemaCustoMonyAdmin = z.object({
  de: z.string(),
  ate: z.string(),
  modelos: z.array(esquemaCustoModeloMony),
  /** Só dos modelos com preço. */
  totalCentavos: z.number().int(),
  chamadas: z.number().int(),
  chamadasComErro: z.number().int(),
  /** Os modelos usados no período que não estão na tabela: o total fica sem eles. */
  modelosSemPreco: z.array(z.string()),
});

/** `GET /admin/metricas` (T-141f): o período em dias de São Paulo, os dois inclusos; até 1 ano. */
export const esquemaConsultaMetricasAdmin = z
  .object({ de: dataDoFiltro, ate: dataDoFiltro })
  .refine((consulta) => consulta.de <= consulta.ate, {
    message: 'O início do período não pode ser depois do fim.',
    path: ['de'],
  })
  .refine(
    (consulta) =>
      Date.parse(`${consulta.ate}T00:00:00Z`) - Date.parse(`${consulta.de}T00:00:00Z`) <
      DIAS_CUSTO_MONY_MAXIMO * 86_400_000,
    { message: 'O período vai até 1 ano.', path: ['ate'] },
  );

const contagemPorOrigem = z.object(
  Object.fromEntries(ORIGENS_TRANSACAO.map((origem) => [origem, z.number().int()])) as Record<
    OrigemTransacao,
    z.ZodNumber
  >,
);

export const esquemaMetricasAdmin = z.object({
  de: z.string(),
  ate: z.string(),
  /** Quando as views foram atualizadas pela última vez; `null`: ainda não foram. */
  atualizadasEm: z.string().nullable(),
  ativos: z.object({
    /** Pessoas diferentes que abriram o app no período (login, cadastro ou renovação). */
    noPeriodo: z.number().int(),
    /** Só os dias com alguém. */
    porDia: z.array(z.object({ dia: z.string(), ativos: z.number().int() })),
  }),
  lancamentos: z.object({
    total: z.number().int(),
    porOrigem: contagemPorOrigem,
    porDia: z.array(z.object({ dia: z.string(), porOrigem: contagemPorOrigem })),
  }),
  alertas: z.object({
    criados: z.number().int(),
    enviados: z.number().int(),
    lidos: z.number().int(),
    /** Só os tipos com algum alerta, do mais criado ao menos. */
    porTipo: z.array(
      z.object({
        tipo: z.enum(TIPOS_ALERTA),
        criados: z.number().int(),
        enviados: z.number().int(),
        lidos: z.number().int(),
      }),
    ),
  }),
});

/** `POST /admin/metricas/atualizar`. */
export const esquemaAtualizacaoMetricasAdmin = z.object({ atualizadasEm: z.string() });

export type DadosLoginAdmin = z.infer<typeof esquemaLoginAdmin>;
export type DesafioAdmin = z.infer<typeof esquemaDesafioAdmin>;
export type Novo2fa = z.infer<typeof esquemaNovo2fa>;
export type DadosCodigo2fa = z.infer<typeof esquemaCodigo2fa>;
export type AdminLogado = z.infer<typeof esquemaAdmin>;
export type SessaoAdmin = z.infer<typeof esquemaSessaoAdmin>;
export type NovoPreco = z.infer<typeof esquemaNovoPreco>;
export type PrecoAdmin = z.infer<typeof esquemaPrecoAdmin>;
export type PrecosAdmin = z.infer<typeof esquemaPrecosAdmin>;
export type LimiteDeUso = z.infer<typeof esquemaLimiteDeUso>;
export type LimiteDeQuantidade = z.infer<typeof esquemaLimiteDeQuantidade>;
export type PlanoGratuitoAdmin = z.infer<typeof esquemaPlanoGratuitoAdmin>;
export type NovoCupom = z.infer<typeof esquemaNovoCupom>;
export type SituacaoCupom = (typeof SITUACOES_CUPOM)[number];
export type CupomAdmin = z.infer<typeof esquemaCupomAdmin>;
export type ConsultaUsuariosAdmin = z.infer<typeof esquemaConsultaUsuariosAdmin>;
export type UsuarioResumoAdmin = z.infer<typeof esquemaUsuarioResumoAdmin>;
export type UsuariosAdmin = z.infer<typeof esquemaUsuariosAdmin>;
export type UsuarioAdmin = z.infer<typeof esquemaUsuarioAdmin>;
export type DadosEstenderTeste = z.infer<typeof esquemaEstenderTeste>;
export type SituacaoAssinaturaAdmin = (typeof SITUACOES_ASSINATURA_ADMIN)[number];
export type ResumoAssinaturasAdmin = z.infer<typeof esquemaResumoAssinaturasAdmin>;
export type ConsultaAssinaturasAdmin = z.infer<typeof esquemaConsultaAssinaturasAdmin>;
export type AssinaturaResumoAdmin = z.infer<typeof esquemaAssinaturaResumoAdmin>;
export type AssinaturasAdmin = z.infer<typeof esquemaAssinaturasAdmin>;
export type ConsultaAuditoriaAdmin = z.infer<typeof esquemaConsultaAuditoriaAdmin>;
export type RegistroAuditoriaAdmin = z.infer<typeof esquemaRegistroAuditoriaAdmin>;
export type AuditoriaAdmin = z.infer<typeof esquemaAuditoriaAdmin>;
export type FiltrosAuditoriaAdmin = z.infer<typeof esquemaFiltrosAuditoriaAdmin>;
export type SituacaoNovidade = (typeof SITUACOES_NOVIDADE)[number];
export type NovaNovidade = z.infer<typeof esquemaNovaNovidade>;
export type DadosPublicarNovidade = z.infer<typeof esquemaPublicarNovidade>;
export type NovidadeAdmin = z.infer<typeof esquemaNovidadeAdmin>;
export type SituacaoAvaliacaoMony = (typeof SITUACOES_AVALIACAO_MONY)[number];
export type NovaVersaoMony = z.infer<typeof esquemaNovaVersaoMony>;
export type ResultadoAvaliacaoMony = z.infer<typeof esquemaResultadoAvaliacaoMony>;
export type VersaoMonyResumoAdmin = z.infer<typeof esquemaVersaoMonyResumoAdmin>;
export type VersoesMonyAdmin = z.infer<typeof esquemaVersoesMonyAdmin>;
export type VersaoMonyAdmin = z.infer<typeof esquemaVersaoMonyAdmin>;
export type ConsultaLogsMonyAdmin = z.infer<typeof esquemaConsultaLogsMonyAdmin>;
export type LogMonyAdmin = z.infer<typeof esquemaLogMonyAdmin>;
export type LogsMonyAdmin = z.infer<typeof esquemaLogsMonyAdmin>;
export type PrecoModeloIa = z.infer<typeof esquemaPrecoModeloIa>;
export type PrecosIaAdmin = z.infer<typeof esquemaPrecosIaAdmin>;
export type ConsultaCustoMonyAdmin = z.infer<typeof esquemaConsultaCustoMonyAdmin>;
export type CustoModeloMony = z.infer<typeof esquemaCustoModeloMony>;
export type CustoMonyAdmin = z.infer<typeof esquemaCustoMonyAdmin>;
export type ConsultaMetricasAdmin = z.infer<typeof esquemaConsultaMetricasAdmin>;
export type MetricasAdmin = z.infer<typeof esquemaMetricasAdmin>;
