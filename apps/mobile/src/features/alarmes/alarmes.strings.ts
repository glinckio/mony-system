export const textosAlarmes = {
  // Textos que o alarme mostra no aparelho (canal e botões da notificação).
  nativo: {
    canal: 'Alarmes',
    parar: 'Parar',
    adiar: 'Adiar 10 min',
  },
  // Tela de teste da PoC do alarme no Android (T-023a), só no ambiente de desenvolvimento.
  poc: {
    atalho: 'Teste do alarme',
    atalhoAjuda: 'Só em desenvolvimento: mede o alarme no Android.',
    titulo: 'Alarme (teste)',
    indisponivel:
      'Este build não tem o módulo de alarme. Ele existe só no Android, num build de desenvolvimento.',
    explicacao:
      'Agende um alarme, feche o app, desligue a internet e bloqueie a tela. Quando tocar, volte aqui e veja o atraso.',
    permissoes: 'Permissões',
    alarmeExato: 'Alarme no horário exato',
    alarmeExatoAjuda: 'Sem ela, o Android pode atrasar o alarme.',
    notificacoes: 'Notificações',
    notificacoesAjuda: 'Sem elas, o alarme não aparece nem toca.',
    telaCheia: 'Tela cheia com o aparelho bloqueado',
    telaCheiaAjuda: 'Sem ela, o alarme aparece só como notificação.',
    liberado: 'Liberado',
    liberar: 'Liberar',
    testar: 'Testar',
    tocarEm: 'Tocar em {{minutos}} min',
    cancelarTodos: 'Cancelar todos',
    tituloTeste: 'Alarme de teste',
    corpoTeste: 'Previsto para {{hora}}.',
    agendados: 'Agendados',
    semAgendados: 'Nenhum alarme agendado.',
    agendado: '{{hora}} · {{titulo}}',
    adiado: '{{hora}} · {{titulo}} (adiado)',
    resultado: '{{agendados}} agendados, {{descartados}} descartados, {{modo}}.',
    exato: 'exato',
    inexato: 'sem o alarme exato',
    disparos: 'Toques',
    semDisparos: 'Nenhum alarme tocou ainda.',
    resumo:
      '{{quantidade}} toques ({{exatos}} exatos) · atraso mediano de {{mediana}} s · maior de {{maior}} s',
    disparo: 'Previsto {{previsto}} · tocou {{disparado}} ({{atraso}} s depois, {{modo}})',
    limpar: 'Limpar histórico',
    erro: 'Não deu certo: {{mensagem}}',
  },
};
