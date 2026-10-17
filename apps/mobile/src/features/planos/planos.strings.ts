/** O plano, o uso das cotas do gratuito (T-100) e a compra dos planos (T-103). */
export const textosPlanos = {
  titulo: 'Seu plano',
  nomes: {
    teste: 'Teste grátis',
    gratuito: 'Plano gratuito',
    mensal: 'Plano mensal',
    anual: 'Plano anual',
  },
  /** "Tudo liberado até 18/out, 12:00." */
  testeAte: 'Tudo liberado até {{data}}, {{hora}}.',
  pagoLiberado: 'Tudo liberado.',
  gratuitoAjuda: 'Tem limites por dia e por mês. Tudo o que você já registrou continua aqui.',
  uso: 'Uso do plano gratuito',
  limites: {
    lancamento_dia: 'Lançamentos hoje',
    lancamento_mes: 'Lançamentos no mês',
    mensagem_mony_dia: 'Mensagens para a Mony hoje',
    leitura_documento_mes: 'Leituras de foto, PDF ou cupom no mês',
    cartao_quantidade: 'Cartões',
    lista_compras_quantidade: 'Listas de compras abertas',
    lembrete_ativo_quantidade: 'Lembretes ativos',
  },
  /** "2 de 3". */
  deLimite: '{{uso}} de {{limite}}',
  voltaAmanha: 'Acabou por hoje. Amanhã libera de novo.',
  voltaMes: 'Acabou neste mês. No dia 1º libera de novo.',
  cheio: 'Para ter mais, conheça os planos.',
  relatorios: 'Os relatórios mostram só o mês atual.',
  erro: 'Não consegui carregar o seu plano.',
  verPlanos: 'Ver planos',
  /** Plano pago, em "Seu plano" (T-103). "R$ 19,90 por mês". */
  valorMensal: '{{valor}} por mês',
  valorAnual: '{{valor}} por ano',
  proximaCobranca: 'Próxima cobrança em {{data}}.',
  terminaEm: 'Termina em {{data}}. Não vai ser renovado.',
  inadimplente:
    'Não consegui cobrar a última fatura. Atualize a forma de pagamento para não voltar ao plano gratuito.',
  /** Anual pago com Pix (T-105). */
  pagoComPix: 'Pago com Pix. Vale até {{data}} e não renova sozinho.',
  renovarPix: 'Pagar mais 12 meses com Pix',
  renovarPixAjuda: 'Os 12 meses novos começam quando o período atual termina.',
  gerenciar: 'Gerenciar assinatura',
  gerenciarAjuda: 'Troque de plano ou de cartão, veja as faturas ou cancele.',
  erroPortal: 'Não consegui abrir a sua assinatura. Tente de novo.',
  /** A tela de planos (`/planos`, T-103), como no design do cliente. */
  venda: {
    fechar: 'Fechar',
    titulo: 'Continue com a Mony cuidando do seu dinheiro',
    testeHoje: 'Seu teste termina hoje',
    testeAmanha: 'Seu teste termina amanhã',
    testeDias: 'Seu teste termina em {{dias}} dias',
    anual: 'Anual',
    mensal: 'Mensal',
    melhorValor: 'Melhor valor',
    /** "equivale a R$ 16,58 por mês". */
    equivale: 'equivale a {{valor}} por mês',
    canceleQuandoQuiser: 'cancele quando quiser',
    porAno: '/ano',
    porMes: '/mês',
    incluso: 'Incluso nos planos pagos',
    beneficios: [
      'Lançamentos ilimitados com a Mony',
      'Leitura de notas fiscais e faturas',
      'Bancos conectados via Open Finance',
      'Cartões, alertas e orçamentos sem limite',
      'Aviso ao abrir apps de compra',
    ],
    assinarAnual: 'Assinar plano anual',
    assinarMensal: 'Assinar plano mensal',
    rodape: 'Cartão · renovação automática · cancele quando quiser',
    /** T-105: a Stripe não aceita Pix em assinatura; no anual, ele é um pagamento único. */
    pagarPix: 'Pagar 12 meses com Pix',
    rodapePix: 'Com Pix, só no anual: 12 meses pagos de uma vez, sem renovação automática.',
    continuarGratuito: 'Continuar no plano gratuito, com limites',
    confirmando: 'Confirmando o pagamento…',
    demorando:
      'O pagamento ainda está sendo confirmado. Assim que a Stripe confirmar, o seu plano é liberado.',
    verSeuPlano: 'Ver seu plano',
    erro: 'Não consegui carregar os planos.',
    erroCheckout: 'Não consegui abrir o pagamento. Tente de novo.',
  },
};
