import type { CampoRascunho } from '@mony/shared/rascunhos';

/**
 * Frases de teste da Mony (doc 08, "Conjunto de frases de teste"; doc 14): a mensagem, o estado do
 * usuário antes dela e o que se espera. Rodam contra uma versão do prompt antes de ativar (95%) e,
 * as de `regra`, em todo CI com o modelo falso. Os nomes de categoria são os padrões do cadastro.
 */
export interface CasoAvaliacao {
  id: string;
  entrada: string;
  /** O que o usuário já tem antes da mensagem. */
  estado?: EstadoAvaliacao;
  /** Resolvido por regra, sem o modelo: roda em todo CI. */
  regra?: boolean;
  espera: Esperado;
}

export interface EstadoAvaliacao {
  cartoes?: readonly string[];
  /** Estabelecimento → categoria (e cartão, pelo nome) já confirmados (RN-090). */
  preferencias?: Readonly<Record<string, { categoria: string; cartao?: string }>>;
  /** Categoria → limite do mês, em centavos. */
  orcamentos?: Readonly<Record<string, number>>;
  /** Despesas já lançadas, no Pix, com os dias antes de hoje. */
  despesas?: readonly {
    descricao: string;
    categoria: string;
    valorCentavos: number;
    diasAtras: number;
  }[];
}

export interface ChamadaEsperada {
  /** O nome, ou um entre vários que servem. */
  nome: string | readonly string[];
  /** Só os campos que importam; o resto da entrada pode ser qualquer coisa. */
  args?: Readonly<Record<string, unknown>>;
}

export interface Esperado {
  /** As chamadas que precisam acontecer, em qualquer ordem; `[]`: nenhuma ferramenta. */
  ferramentas?: readonly ChamadaEsperada[];
  /** Ferramentas que não podem ser chamadas. */
  semFerramentas?: readonly string[];
  /** O primeiro componente da resposta. */
  componente?: {
    tipo: 'botoes' | 'resumo';
    /** O campo do rascunho que a pergunta pede. */
    pergunta?: CampoRascunho;
    /** O rótulo do primeiro botão. */
    primeiraOpcao?: string;
    /** Os ids das opções (ex.: `desfazer`). */
    acoes?: readonly string[];
  };
  /** Sem componente nenhum. */
  semComponente?: boolean;
  /** Trechos que precisam aparecer no texto (sem acento e caixa). */
  contem?: readonly string[];
  /** Trechos que não podem aparecer no texto (sem acento e caixa). */
  naoContem?: readonly string[];
}

export const CASOS_AVALIACAO: readonly CasoAvaliacao[] = [
  // Por regra (RN-080, RN-081, RN-082): rodam com o modelo falso.
  {
    id: 'gasto-incompleto',
    entrada: 'gastei 10',
    regra: true,
    espera: { ferramentas: [], componente: { tipo: 'botoes', pergunta: 'categoria' } },
  },
  {
    id: 'gasto-com-categoria',
    entrada: 'gastei 25 no mercado',
    regra: true,
    espera: { ferramentas: [], componente: { tipo: 'botoes', pergunta: 'forma_pagamento' } },
  },
  {
    id: 'gasto-completo',
    entrada: 'paguei 32,90 no mercado no pix',
    regra: true,
    espera: {
      ferramentas: [],
      componente: { tipo: 'resumo', acoes: ['desfazer'] },
      contem: ['anotei r$ 32,90'],
    },
  },
  {
    id: 'gasto-preferencia-primeiro',
    entrada: 'gastei 80 no iFood no Nubank',
    estado: {
      cartoes: ['Nubank', 'Inter'],
      preferencias: { iFood: { categoria: 'Alimentação', cartao: 'Nubank' } },
    },
    regra: true,
    espera: {
      ferramentas: [],
      componente: { tipo: 'botoes', pergunta: 'categoria', primeiraOpcao: 'Alimentação' },
    },
  },
  {
    id: 'credito-sem-cartao',
    entrada: 'gastei 50 no crédito',
    regra: true,
    espera: {
      ferramentas: [],
      componente: { tipo: 'botoes', pergunta: 'categoria' },
    },
  },
  {
    id: 'impacto-no-orcamento',
    entrada: 'gastei 90 no mercado no pix',
    estado: { orcamentos: { Mercado: 10_000 } },
    regra: true,
    espera: { ferramentas: [], componente: { tipo: 'resumo', acoes: ['desfazer'] } },
  },

  // Pelo modelo: rodam com o provedor de verdade.
  {
    id: 'receita',
    entrada: 'recebi 3500 de salário',
    espera: {
      ferramentas: [{ nome: 'criar_transacao', args: { tipo: 'receita', valorCentavos: 350_000 } }],
    },
  },
  {
    id: 'gasto-sem-valor',
    entrada: 'comprei um tênis',
    espera: { ferramentas: [], semComponente: true, contem: ['quanto'] },
  },
  {
    id: 'consulta-mes',
    entrada: 'quanto eu gastei esse mês?',
    espera: { ferramentas: [{ nome: 'resumo_periodo' }], semFerramentas: ['criar_transacao'] },
  },
  {
    id: 'fatura-do-cartao',
    entrada: 'quanto está a fatura do Nubank?',
    estado: { cartoes: ['Nubank'] },
    espera: { ferramentas: [{ nome: ['consultar_cartao', 'listar_cartoes'] }] },
  },
  {
    id: 'definir-orcamento',
    entrada: 'quero gastar no máximo 600 reais por mês com mercado',
    espera: {
      ferramentas: [{ nome: 'definir_orcamento', args: { limiteCentavos: 60_000 } }],
    },
  },
  {
    id: 'metas',
    entrada: 'como estão minhas metas?',
    espera: { ferramentas: [{ nome: 'consultar_metas' }] },
  },
  // Lembretes e ajuda (T-086a). A avaliação roda no dia de hoje: a data do lembrete varia.
  {
    id: 'lembrete-com-dia-e-hora',
    entrada: 'me lembra de pagar o IPVA dia 20 às 9h',
    espera: {
      ferramentas: [{ nome: 'criar_lembrete', args: { hora: '09:00' } }],
      semFerramentas: ['criar_transacao'],
    },
  },
  {
    id: 'lembrete-que-repete',
    entrada: 'todo dia às 8 da manhã me lembra de tomar o remédio',
    espera: {
      ferramentas: [
        { nome: 'criar_lembrete', args: { hora: '08:00', repeticao: { frequencia: 'diaria' } } },
      ],
    },
  },
  // Agenda (T-086b).
  {
    id: 'compromisso-com-dia-e-hora',
    entrada: 'marca dentista sexta às 14h',
    espera: {
      ferramentas: [{ nome: 'criar_compromisso', args: { hora: '14:00' } }],
      semFerramentas: ['criar_lembrete', 'criar_transacao'],
    },
  },
  {
    id: 'consultar-agenda',
    entrada: 'o que eu tenho na agenda amanhã?',
    espera: {
      ferramentas: [{ nome: 'consultar_agenda' }],
      semFerramentas: ['consultar_lembretes'],
    },
  },
  {
    id: 'ajuda-do-app',
    entrada: 'como eu exporto meus relatórios?',
    espera: { ferramentas: [{ nome: 'ajuda_app' }], semFerramentas: ['resumo_periodo'] },
  },
  {
    id: 'excluir-pede-confirmacao',
    entrada: 'apaga o gasto da padaria de ontem',
    estado: {
      despesas: [
        { descricao: 'Padaria', categoria: 'Alimentação', valorCentavos: 1_250, diasAtras: 1 },
      ],
    },
    espera: {
      ferramentas: [{ nome: 'excluir_transacao' }],
      componente: { tipo: 'botoes' },
      naoContem: ['exclui o', 'excluido', 'apaguei'],
    },
  },
  {
    id: 'lista-de-compras',
    entrada: 'põe leite e pão na minha lista do mercado',
    espera: {
      ferramentas: [{ nome: 'gerenciar_lista_compras' }],
      semFerramentas: ['criar_transacao'],
    },
  },
  {
    id: 'nao-recomenda-investimento',
    entrada: 'devo comprar bitcoin?',
    espera: {
      ferramentas: [],
      naoContem: ['recomendo comprar', 'compre bitcoin', 'vale a pena comprar'],
    },
  },
  {
    id: 'sem-julgamento',
    entrada: 'gastei demais esse mês né',
    espera: {
      ferramentas: [{ nome: 'resumo_periodo' }],
      naoContem: ['irresponsavel', 'descontrol', 'deveria ter vergonha'],
    },
  },
];
