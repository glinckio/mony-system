/** Lembretes (T-084b; RN-075, RN-076). */
export const textosLembretes = {
  titulo: 'Lembretes',
  novo: 'Novo lembrete',
  editar: 'Editar lembrete',
  abas: {
    proximos: 'Próximos',
    recorrentes: 'Recorrentes',
    feitos: 'Feitos',
  },
  abasRotulo: 'Quais lembretes',
  grupos: {
    pendentes: 'Já tocaram',
    hoje: 'Hoje',
    amanha: 'Amanhã',
    proximos: 'Próximos dias',
  },
  vazio: {
    proximos: 'Nenhum lembrete por vir.',
    recorrentes: 'Nenhum lembrete que repete.',
    feitos: 'Nenhum lembrete feito ainda.',
    descricao: 'Crie um lembrete com a hora certa para tocar, uma vez ou repetindo.',
  },
  dicaMony: 'Peça no chat: "me lembra de pagar o IPVA dia 20 às 9h"',
  /** O selo do canal principal. */
  canais: {
    push: 'Push',
    alarme: 'Alarme',
  },
  /** "Adiado até 10:20". */
  adiadoAte: 'Adiado até {{hora}}',
  /** "Toda semana · 08:00". */
  comHora: '{{texto}} · {{hora}}',
  /** "QUA" e "21" no bloco da data. */
  semanaCurta: ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'],
  repeticao: {
    nao: 'Não repete',
    diaria: 'Todo dia',
    diariaIntervalo: 'A cada {{intervalo}} dias',
    semanal: 'Toda semana',
    semanalIntervalo: 'A cada {{intervalo}} semanas',
    mensal: 'Todo mês',
    mensalIntervalo: 'A cada {{intervalo}} meses',
    anual: 'Todo ano',
    anualIntervalo: 'A cada {{intervalo}} anos',
    /** "Toda semana: seg, qua". */
    nosDias: '{{texto}}: {{dias}}',
    /** "Todo mês, dia 15". */
    noDia: '{{texto}}, dia {{dia}}',
    /** "Todo ano, 15/out". */
    naData: '{{texto}}, {{data}}',
    /** "Todo dia, até 31/12/2027". */
    ate: '{{texto}}, até {{data}}',
    diasCurtos: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  },
  detalhe: {
    quando: 'Quando',
    repeticao: 'Repetição',
    canais: 'Avisar por',
    pendente: 'Tocou e espera o feito.',
    feito: 'Feito',
    feitoEm: 'Feito.',
    adiar: 'Adiar',
    editar: 'Editar',
    excluir: 'Excluir',
    lembrarDeNovo: 'Lembrar de novo',
    naoEncontrado: 'Este lembrete não existe mais.',
    /** "Sexta, 16/10/2026 às 08:00". */
    dataHora: '{{dia}}, {{data}} às {{hora}}',
  },
  adiamento: {
    titulo: 'Adiar o lembrete',
    dezMinutos: '10 minutos',
    umaHora: '1 hora',
    amanha: 'Amanhã, no mesmo horário',
    cancelar: 'Cancelar',
  },
  exclusao: {
    titulo: 'Excluir "{{titulo}}"?',
    texto: 'O lembrete some da lista e não toca mais.',
    confirmar: 'Excluir',
    cancelar: 'Cancelar',
  },
  formulario: {
    titulo: 'O que lembrar',
    tituloExemplo: 'Ex.: Pagar a conta de luz',
    data: 'Data',
    dataAjuda: 'DD/MM/AAAA',
    hora: 'Hora',
    horaAjuda: 'HH:MM',
    repeticao: 'Repetir',
    intervalo: 'A cada quantos',
    intervaloAjuda: '1 é sem pular nenhum.',
    dias: 'Nos dias',
    ate: 'Até',
    ateAjuda: 'DD/MM/AAAA; vazio é sem fim.',
    canais: 'Avisar por',
    push: 'Notificação',
    alarme: 'Alarme (toca mesmo sem internet)',
    salvar: 'Salvar',
    validacao: {
      titulo: 'Diga o que lembrar.',
      data: 'Digite uma data que existe.',
      hora: 'Digite a hora no formato HH:MM.',
      passado: 'Escolha uma data e hora que ainda não passou.',
      intervalo: 'Use um número de 1 a 99.',
      dias: 'Escolha pelo menos um dia.',
      ate: 'Digite uma data que existe, depois da data do lembrete.',
      canais: 'Escolha pelo menos um jeito de avisar.',
    },
  },
  permissoes: {
    titulo: 'Para o alarme tocar na hora',
    texto:
      'O Android pede duas liberações: o alarme no horário exato (sem ela, ele pode atrasar) e a tela cheia com o aparelho bloqueado.',
    alarmeExato: 'Liberar o alarme exato',
    telaCheia: 'Liberar a tela cheia',
    depois: 'Agora não',
  },
  semConexao: 'Sem conexão. Tente de novo.',
};
