/** Textos do onboarding, do checklist de primeiros passos e das dicas contextuais. */
export const textosOnboarding = {
  etapa: 'Etapa {{atual}} de {{total}}',
  pular: 'Pular',
  continuar: 'Continuar',
  /** No fim de "Rever tutorial". */
  entendi: 'Entendi',
  boasVindas: {
    titulo: 'Registre gastos só conversando',
    texto:
      'Mande texto, áudio ou foto da nota. A Mony organiza, avisa quando algo sai do plano e lembra das suas contas.',
    ilustracao: {
      rotulo: 'Exemplo de conversa com a Mony',
      mensagem: 'gastei 45 no mercado',
      pergunta: 'Como você pagou?',
      opcoes: ['Nubank', 'Pix', 'Débito'],
      registrado: 'Registrado',
      descricao: 'Mercado',
      valor: 'R$ 45,00',
      detalhes: 'Alimentação · Nubank · hoje',
      orcamento: '62% do orçamento de Alimentação',
    },
  },
  avisos: {
    titulo: 'Avisos antes do aperto',
    texto:
      'A Mony acompanha o limite do cartão, as faturas e os orçamentos, e avisa antes de virar problema.',
    ilustracao: {
      rotulo: 'Exemplo de avisos da Mony',
      cartao: 'Nubank chegou a 80% do limite',
      cartaoDetalhe: 'Disponível: R$ 400,00',
      fatura: 'Fatura de outubro vence em 3 dias',
      faturaDetalhe: 'R$ 1.240,00 · vence 21/out',
    },
  },
  permissoes: {
    titulo: 'Deixe a Mony te avisar na hora certa',
    texto: 'Você escolhe o que liberar. Dá para mudar depois em Configurações.',
    tituloConfiguracoes: 'Permissões',
    textoConfiguracoes: 'O que a Mony pode usar no seu aparelho.',
    concluir: 'Concluir',
    depois: 'Configurar depois',
    pronto: 'Pronto',
    emBreve: 'Em breve',
    negada: 'Para liberar, abra as configurações do aparelho.',
    itens: {
      notificacoes: {
        titulo: 'Notificações',
        texto: 'Limite do cartão, faturas e lembretes',
      },
      agenda: {
        titulo: 'Agenda',
        texto: 'A Mony marca compromissos para você',
      },
      'apps-de-compra': {
        titulo: 'Apps de compra',
        texto: 'Aviso do seu orçamento ao abrir Shopee, Mercado Livre e outros',
      },
    },
  },
  checklist: {
    titulo: 'Termine de configurar',
    progresso: '{{feitas}} de {{total}} passos feitos',
    folha: 'Primeiros passos',
    fazer: 'Fazer agora',
    dispensar: 'Dispensar',
    feita: 'Feito',
    dispensada: 'Dispensado',
    // Os dois primeiros passos pendentes viram a frase do cartão ("Cadastre seus cartões e defina…").
    frase: '{{primeiro}} e {{segundo}}.',
    fraseUma: '{{primeiro}}.',
    etapas: {
      'primeiro-lancamento': {
        titulo: 'Registrar o primeiro gasto',
        texto: 'Anote um gasto aqui ou conte para a Mony.',
        frase: 'registre seu primeiro gasto',
      },
      cartoes: {
        titulo: 'Cadastrar seus cartões',
        texto: 'Para a Mony acompanhar limite e faturas.',
        frase: 'cadastre seus cartões',
      },
      orcamento: {
        titulo: 'Definir os orçamentos do mês',
        texto: 'Um limite por categoria, com aviso perto do fim.',
        frase: 'defina os orçamentos do mês',
      },
      permissoes: {
        titulo: 'Liberar os avisos',
        texto: 'Notificações, agenda e apps de compra.',
        frase: 'libere os avisos da Mony',
      },
      tour: {
        titulo: 'Conhecer o app',
        texto: 'As dicas aparecem na primeira visita a cada tela.',
        frase: 'conheça o app',
      },
    },
    erro: 'Não foi possível salvar. Confira a conexão e tente de novo.',
  },
  dica: {
    rotulo: 'Dica',
    entendi: 'Entendi',
    textos: {
      'transacoes.selecao':
        'Segure um lançamento para selecionar vários e mudar a categoria ou excluir de uma vez.',
      'mony.primeira-conversa':
        'Escreva como você falaria: "gastei 45 no mercado no débito". A Mony pergunta o que faltar.',
    },
  },
  semConexao: 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
};
