/** Textos das telas de contas manuais (sem design próprio, no visual do app). */
export const textosContas = {
  titulo: 'Contas',
  nova: 'Nova conta',
  editar: 'Editar conta',
  vazio: 'Nenhuma conta ainda',
  naoEncontrada: 'Conta não encontrada.',
  vazioDescricao:
    'Cadastre a conta corrente, a poupança ou a carteira para ver o saldo de cada uma.',
  doBanco: 'do banco',
  tipos: {
    corrente: 'Conta corrente',
    poupanca: 'Poupança',
    carteira: 'Carteira',
  },
  campos: {
    nome: 'Nome',
    nomeExemplo: 'Ex.: Nubank',
    tipo: 'Tipo',
    saldoInicial: 'Saldo inicial',
    saldoInicialAjuda: 'Quanto tinha na conta antes do primeiro lançamento no app.',
    negativo: 'Saldo negativo (cheque especial)',
  },
  validacao: {
    nome: 'Informe um nome de até 60 letras.',
  },
  bancoSoNome:
    'Conta do banco (Open Finance): tipo e saldo vêm do banco, aqui só o nome muda. Para tirar, desconecte o banco.',
  salvar: 'Salvar',
  excluir: 'Excluir conta',
  exclusao: {
    titulo: 'Excluir {{nome}}?',
    texto:
      'Os lançamentos, recorrências e cartões que usam esta conta continuam, só que sem conta.',
    confirmar: 'Excluir',
    cancelar: 'Cancelar',
  },
  semConexao: 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.',
};
