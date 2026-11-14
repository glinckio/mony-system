/**
 * Os campos que o cliente deixou em aberto nos termos e na política (T-140g), para preencher no
 * lançamento. Entre colchetes, como vieram na minuta: trocar aqui troca nas duas páginas.
 */
export const CAMPOS_ABERTOS = {
  /** A data em que os textos passam a valer, por extenso (ex.: "1º de dezembro de 2026"). */
  vigencia: '[DATA DE PUBLICAÇÃO]',
  /** Antecedência do aviso de mudança nos limites dos planos. */
  avisoMudancaLimitesDias: '[30]',
  /** Por quanto tempo o histórico de cobrança fica depois da exclusão da conta. */
  guardaCobrancaAnos: '[5]',
  /** Onde fica o serviço de telefonia (ligação de lembrete e SMS), ainda não contratado. */
  paisTelefonia: '[PAÍS]',
} as const;

/** A empresa que oferece o app e controla os dados. */
export const EMPRESA = {
  nome: '57.620.690 Leonardo Munhoz dos Santos',
  cnpj: '57.620.690/0001-07',
  endereco: 'Rua Aristeu do Amaral, 24, Jardim Acapulco, São Carlos/SP, CEP 13563-700',
  suporte: 'suporte@monitorizze.com.br',
  encarregado: 'Leonardo Munhoz',
  emailEncarregado: 'leonardo@monitorizze.com.br',
} as const;
