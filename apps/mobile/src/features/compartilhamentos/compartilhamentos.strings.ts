/** Compartilhar listas e lembretes (T-124d; RN-074). */
export const textosCompartilhamentos = {
  compartilhar: 'Compartilhar',
  titulo: {
    lista: 'Compartilhar a lista',
    lembrete: 'Compartilhar o lembrete',
  },
  ajuda: 'A pessoa precisa ter conta no Mony. O convite aparece para ela aceitar.',
  contato: 'E-mail ou celular',
  contatoExemplo: 'Ex.: ana@email.com',
  permissao: 'O que a pessoa pode fazer',
  permissoes: {
    ver: 'Só ver',
    editar: 'Ver e mudar',
  },
  /** O que `editar` deixa fazer em cada recurso. */
  permissoesAjuda: {
    lista: 'Mudar deixa pôr, marcar e tirar itens e finalizar a lista.',
    lembrete: 'Mudar deixa marcar como feito e adiar.',
  },
  convidar: 'Convidar',
  convidado: 'Convite enviado para {{nome}}.',
  validacao: {
    contato: 'Informe o e-mail ou o celular da pessoa.',
  },
  pessoas: 'Quem tem acesso',
  ninguem: 'Ainda com ninguém.',
  status: {
    pendente: 'Convite enviado',
    aceito: 'Aceitou',
    recusado: 'Recusou',
  },
  tirar: 'Tirar {{nome}}',
  mudarPermissao: 'Permissão de {{nome}}',
  fechar: 'Fechar',
  /** "Compartilhada com 2 pessoas" (doc 04). */
  compartilhadaCom_one: 'Compartilhada com {{count}} pessoa',
  compartilhadaCom_other: 'Compartilhada com {{count}} pessoas',
  compartilhadoCom_one: 'Compartilhado com {{count}} pessoa',
  compartilhadoCom_other: 'Compartilhado com {{count}} pessoas',
  /** Na lista ou no lembrete de outra pessoa. */
  deOutro: {
    lista: 'Lista de {{nome}}',
    lembrete: 'Lembrete de {{nome}}',
  },
  soVer: 'Você só pode ver.',
  sair: {
    lista: 'Sair da lista',
    lembrete: 'Sair do lembrete',
    titulo: {
      lista: 'Sair da lista?',
      lembrete: 'Sair do lembrete?',
    },
    texto: '{{nome}} precisa convidar você de novo para voltar.',
    confirmar: 'Sair',
    cancelar: 'Cancelar',
  },
  convites: {
    titulo: 'Convites para você',
    /** "Ana chamou você para a lista Mercado do mês". */
    lista: '{{nome}} chamou você para a lista “{{recurso}}”',
    lembrete: '{{nome}} chamou você para o lembrete “{{recurso}}”',
    aceitar: 'Aceitar',
    recusar: 'Recusar',
  },
  semConexao: 'Sem conexão. Tente de novo.',
} as const;
