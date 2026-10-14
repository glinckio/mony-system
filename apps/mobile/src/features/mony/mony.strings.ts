export const textosMony = {
  titulo: 'Mony',
  boasVindas: 'Oi! Me conte um gasto, como "gastei 10 no mercado", que eu anoto para você.',
  campo: 'Mensagem para a Mony',
  exemplo: 'gastei 10 no mercado',
  enviar: 'Enviar',
  escrevendo: 'Mony está escrevendo…',
  semConexao: 'Não consegui falar com a Mony. Confira a conexão e tente de novo.',
  /** Mensagem de voz (T-064). */
  audio: {
    gravar: 'Gravar áudio',
    /** "Gravando 0:07". */
    gravando: 'Gravando {{duracao}}',
    enviar: 'Enviar áudio',
    cancelar: 'Cancelar gravação',
    entendendo: 'Entendendo o áudio…',
    semPermissao: 'Para falar com a Mony, permita o microfone nos Ajustes do aparelho.',
    falhou: 'Não consegui gravar o áudio. Tente de novo.',
  },
  /** Atalhos acima do campo (T-069). */
  atalhos: 'Sugestões',
  historico: {
    erro: 'Não consegui carregar as mensagens antigas.',
    tentarDeNovo: 'Tentar de novo',
  },
  busca: {
    abrir: 'Buscar na conversa',
    titulo: 'Buscar na conversa',
    campo: 'Buscar mensagem',
    ajuda: 'Digite pelo menos 2 letras.',
    vazia: 'Nenhuma mensagem com esse texto.',
    erro: 'Não consegui buscar agora. Tente de novo.',
    voce: 'Você',
    mony: 'Mony',
  },
  /** O arquivo da mensagem da pessoa, no balão. */
  arquivo: {
    audio: 'Áudio',
    foto: 'Foto',
    pdf: 'PDF',
  },
  /** Foto, print e PDF (T-065). */
  documento: {
    anexar: 'Mandar foto ou PDF',
    titulo: 'Mandar para a Mony',
    ajuda:
      'Cupom, nota, comprovante, fatura ou extrato. Eu leio e você confirma antes de eu anotar.',
    camera: 'Tirar foto',
    galeria: 'Foto ou print da galeria',
    pdf: 'PDF',
    qr: 'QR Code do cupom fiscal',
    erros: {
      semPermissao: 'Libere a câmera nas configurações do aparelho para fotografar.',
      grande: 'O arquivo passa de 10 MB.',
      tipo: 'Escolha um arquivo PDF.',
      envio: 'Não consegui enviar o arquivo. Tente de novo.',
    },
  },
  /** QR Code do cupom fiscal (T-066b). */
  nfce: {
    titulo: 'Ler o cupom fiscal',
    ajuda: 'Aponte a câmera para o QR Code do cupom. Eu busco a compra na Sefaz e você confirma.',
    fechar: 'Fechar',
    /** O balão da pessoa, como a API grava no histórico. */
    mensagem: 'QR Code do cupom fiscal',
    semPermissao: 'Libere a câmera para ler o QR Code do cupom.',
    permitir: 'Permitir câmera',
    ajustes: 'Abrir ajustes',
    avisos: {
      SEM_CHAVE: 'Esse QR Code não é de um cupom fiscal.',
      DIGITO_INVALIDO: 'Não consegui ler a chave do cupom. Aproxime ou limpe a câmera.',
      UF_INVALIDA: 'Esse QR Code não é de um cupom fiscal.',
      NAO_E_NFCE: 'Esse é de nota fiscal eletrônica, não de cupom. Mande a foto ou o PDF da nota.',
      homologacao: 'Esse cupom é de teste do estabelecimento e não tem compra.',
    },
  },
  resumo: {
    despesa: 'Despesa anotada',
    receita: 'Receita anotada',
    despesaAConfirmar: 'Despesa para confirmar',
    receitaAConfirmar: 'Receita para confirmar',
    categoriaAEscolher: 'Categoria a escolher',
    formaAEscolher: 'Forma a escolher',
    /** "Nubank em 3x de R$ 200,00". */
    cartaoParcelado: '{{cartao}} em {{parcelas}}x de {{valor}}',
  },
};
