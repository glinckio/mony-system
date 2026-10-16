/** Central de notificações e alertas da Mony (T-087). */
export const textosNotificacoes = {
  /** O push no aparelho (T-088): nomes dos canais do Android e os botões das notificações. */
  push: {
    canais: {
      alertas: 'Alertas',
      lembretes: 'Lembretes',
      novidades: 'Novidades',
    },
    feito: 'Feito',
    adiar: 'Adiar 10 min',
    paguei: 'Paguei',
  },
  titulo: 'Notificações',
  abas: 'Alertas ou novidades',
  abaAlertas: 'Alertas',
  abaNovidades: 'Novidades',
  /** "Novidades (2)". */
  abaNovidadesNovas: 'Novidades ({{quantidade}})',
  novidades: {
    vazia: 'Nenhuma novidade por enquanto.',
    erro: 'Não consegui carregar as novidades.',
    selo: 'Nova',
    /** Leitor de tela: "Nova: Agora com metas". */
    nova: 'Nova: {{titulo}}',
    video: 'Assistir ao vídeo',
    assistir: 'Assistir ao vídeo: {{titulo}}',
  },
  todas: 'Todas',
  naoLidas: 'Não lidas',
  filtro: 'Quais notificações',
  marcarTodas: 'Marcar todas como lidas',
  vazia: 'Nenhuma notificação por aqui.',
  vaziaNaoLidas: 'Você leu todas as notificações.',
  erro: 'Não consegui carregar as notificações.',
  tentarDeNovo: 'Tentar de novo',
  /** Leitor de tela: "Não lida: Nubank: 80% do limite". */
  naoLida: 'Não lida: {{titulo}}',
  /** "14/out, 09:05". */
  quando: '{{data}}, {{hora}}',
  alertas: {
    titulo: 'Alertas da Mony',
    silencio: 'Horário de silêncio',
    silencioAjuda:
      'Nesse horário os alertas esperam e chegam juntos no fim. Fatura atrasada, lembretes e assinatura chegam sempre.',
    inicio: 'Começa às',
    fim: 'Termina às',
    tipos: 'O que avisar',
    antecedencia: 'Avisar antes',
    /** "3 dias antes", "No dia". */
    dias_one: '{{count}} dia antes',
    dias_other: '{{count}} dias antes',
    noDia: 'No dia',
    sempre: 'Sempre ligado',
    salvar: 'Salvar',
    salvo: 'Alertas salvos.',
    erroHora: 'Hora no formato 22:00.',
    erroIguais: 'O começo e o fim precisam ser diferentes.',
    erroSalvar: 'Não consegui salvar. Tente de novo.',
    erroCarregar: 'Não consegui carregar os alertas.',
  },
  /** Os tipos de alerta, na tela "Alertas da Mony". */
  tipos: {
    limite_cartao: 'Limite do cartão',
    fatura_fechada: 'Fatura fechada',
    fatura_vencimento: 'Vencimento da fatura',
    fatura_atrasada: 'Fatura atrasada',
    orcamento: 'Orçamentos',
    gasto_fora_padrao: 'Gasto fora do padrão',
    projecao_mes: 'Projeção do mês',
    vencimento_pendente: 'Contas a vencer',
    app_compra: 'Apps de compra',
    lembrete: 'Lembretes',
    compromisso: 'Compromissos',
    resumo_periodo: 'Resumos da semana e do mês',
    open_finance: 'Conexão com o banco',
    assinatura: 'Assinatura',
    novidade: 'Novidades do app',
  },
};
