export const textosInicio = {
  titulo: 'Início',
  perfil: 'Perfil e configurações',
  pesquisar: 'Pesquisar',
  pesquisarDica: 'Busca nos lançamentos',
  periodo: {
    botao: 'Escolher o período',
    titulo: 'Período',
    // Curtos, para caber nas três abas (RN-021: mês atual, mês anterior, personalizado).
    mes_atual: 'Este mês',
    mes_anterior: 'Mês passado',
    personalizado: 'Escolher',
    de: 'De',
    ate: 'Até',
    ajuda: 'DD/MM/AAAA',
    invalido: 'O fim vem depois do início, em até 366 dias.',
    aplicar: 'Aplicar',
  },
  notificacoes: 'Nenhuma notificação nova',
  notificacoesNovas: '{{quantidade}} notificações não lidas',
  notificacaoNova: '1 notificação não lida',
  saldo: {
    /** "Saldo de outubro". */
    mes: 'Saldo de {{mes}}',
    /** "Saldo de 1/set a 15/out". */
    intervalo: 'Saldo de {{de}} a {{ate}}',
    verMes: 'Ver o mês',
    verPeriodo: 'Ver os lançamentos',
  },
  atalhos: {
    lancar: 'Lançar',
    orcamentos: 'Orçamentos',
    metas: 'Metas',
  },
  resumo: {
    titulo: 'Resumo',
    receitas: 'Receitas',
    recebidas: '{{valor}} recebidos',
    despesasPagas: 'Despesas pagas',
    despesasPendentes: 'A pagar',
  },
  vencimentos: {
    titulo: 'Próximos vencimentos',
    vazio: 'Nada vencendo nos próximos 30 dias.',
    vence: 'vence {{data}}',
    venceHoje: 'vence hoje',
    atrasado: 'atrasado desde {{data}}',
  },
  cartoes: {
    titulo: 'Cartões',
    doLimite: '{{percentual}}% do limite',
    vence: 'vence {{data}}',
  },
  orcamentos: {
    titulo: 'Orçamentos de {{mes}}',
    total: '{{gasto}} de {{limite}}',
  },
  semConexao: 'Sem conexão. Tente de novo.',
};
