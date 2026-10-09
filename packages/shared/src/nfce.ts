/**
 * Leitura do QR Code do cupom fiscal eletrônico (NFC-e, modelo 65), sem acessar a rede
 * (docs/agentes/poc/T-026.md).
 *
 * O QR Code traz a URL de consulta da Sefaz do estado com a chave de acesso no parâmetro `p`:
 * - versão 3 (NT 2025.001, obrigatória desde set/2025): `?p=<chave>|3|<tpAmb>` (contingência:
 *   `?p=<chave>|3|<tpAmb>|<dia>|<valor>|<tpIdDest>|<idDest>|<assinatura>`);
 * - versão 2: `?p=<chave>|2|<tpAmb>|<cIdToken>|<hash>` (contingência com mais campos);
 * - versão 1 (cupons antigos): `?chNFe=<chave>&nVersao=100&tpAmb=...`.
 * A chave sozinha (44 caracteres, digitada ou de um leitor) também é aceita.
 *
 * Desde jul/2026 o CNPJ pode ter letras (NT Conjunta 2025.001): as posições 7 a 18 da chave aceitam
 * `A-Z`, e o dígito verificador usa o código ASCII menos 48 de cada caractere.
 */

/** Código IBGE da UF (dois primeiros dígitos da chave) → sigla. */
export const UFS_POR_CODIGO = {
  '11': 'RO',
  '12': 'AC',
  '13': 'AM',
  '14': 'RR',
  '15': 'PA',
  '16': 'AP',
  '17': 'TO',
  '21': 'MA',
  '22': 'PI',
  '23': 'CE',
  '24': 'RN',
  '25': 'PB',
  '26': 'PE',
  '27': 'AL',
  '28': 'SE',
  '29': 'BA',
  '31': 'MG',
  '32': 'ES',
  '33': 'RJ',
  '35': 'SP',
  '41': 'PR',
  '42': 'SC',
  '43': 'RS',
  '50': 'MS',
  '51': 'MT',
  '52': 'GO',
  '53': 'DF',
} as const;

export type SiglaUf = (typeof UFS_POR_CODIGO)[keyof typeof UFS_POR_CODIGO];

/** Modelo do documento na chave: 65 é NFC-e (55 é NF-e, que não tem esse QR Code). */
export const MODELO_NFCE = '65';

/** Tipo de emissão 9 = contingência offline: a nota pode demorar a aparecer na Sefaz. */
export const EMISSAO_CONTINGENCIA_OFFLINE = 9;

export interface ChaveNfce {
  /** Chave de acesso, 44 caracteres em maiúsculas. */
  chave: string;
  uf: SiglaUf;
  /** Mês de emissão, `AAAA-MM`. */
  mesEmissao: string;
  /** CNPJ do emitente (14 caracteres; pode ter letras a partir de jul/2026). */
  cnpjEmitente: string;
  serie: number;
  numero: number;
  tipoEmissao: number;
}

export type ErroLeituraNfce =
  /** Não há uma chave de 44 caracteres no conteúdo. */
  | 'SEM_CHAVE'
  /** A chave não bate com o dígito verificador (QR danificado ou digitação errada). */
  | 'DIGITO_INVALIDO'
  /** Código de UF que não existe. */
  | 'UF_INVALIDA'
  /** Chave de outro documento fiscal (ex.: NF-e modelo 55). */
  | 'NAO_E_NFCE';

export type LeituraNfce =
  | {
      ok: true;
      nota: ChaveNfce;
      /** Versão do QR Code (1, 2 ou 3), ou `null` quando veio só a chave. */
      versaoQr: number | null;
      /** `homologacao` é cupom de teste do estabelecimento: não vale como compra. */
      ambiente: 'producao' | 'homologacao' | null;
    }
  | { ok: false; erro: ErroLeituraNfce };

const FORMATO_CHAVE = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/;

/**
 * Dígito verificador da chave (módulo 11, pesos 2 a 9 da direita para a esquerda sobre os 43
 * primeiros caracteres). Cada caractere vale o código ASCII menos 48: dígitos valem o próprio
 * número e letras valem de 17 (`A`) em diante.
 */
export function calcularDigitoChave(chaveSemDigito: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = chaveSemDigito.length - 1; i >= 0; i -= 1) {
    soma += (chaveSemDigito.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function ehSiglaConhecida(codigo: string): codigo is keyof typeof UFS_POR_CODIGO {
  return Object.hasOwn(UFS_POR_CODIGO, codigo);
}

/**
 * Parâmetros da parte de consulta da URL (`?a=1&b=2`). Sem `URLSearchParams`, que não existe em
 * todos os ambientes que usam este pacote.
 */
function lerParametros(texto: string): Map<string, string> {
  const parametros = new Map<string, string>();
  const inicio = texto.indexOf('?');
  if (inicio < 0) return parametros;
  const consulta = texto.slice(inicio + 1).split('#')[0] ?? '';
  for (const par of consulta.split('&')) {
    const igual = par.indexOf('=');
    const nome = igual < 0 ? par : par.slice(0, igual);
    const valor = igual < 0 ? '' : par.slice(igual + 1);
    try {
      parametros.set(decodeURIComponent(nome), decodeURIComponent(valor));
    } catch {
      // Codificação inválida: ignora o parâmetro.
    }
  }
  return parametros;
}

interface CamposQr {
  chave: string;
  versaoQr: number | null;
  /** `tpAmb` do QR Code: 1 produção, 2 homologação. */
  tpAmb: string | undefined;
}

/** Separa a chave, a versão e o ambiente do texto lido. */
function extrairCampos(conteudo: string): CamposQr | null {
  const texto = conteudo.trim();
  const parametros = lerParametros(texto);
  const p = parametros.get('p');
  if (p !== undefined) {
    const [chave = '', versao, tpAmb] = p.split('|').map((campo) => campo.trim());
    return { chave: chave.toUpperCase(), versaoQr: Number(versao) || null, tpAmb };
  }
  const chNFe = parametros.get('chNFe');
  if (chNFe !== undefined) {
    return { chave: chNFe.trim().toUpperCase(), versaoQr: 1, tpAmb: parametros.get('tpAmb') };
  }
  // Só a chave: aceita espaços e pontuação da digitação (ex.: grupos de 4 do cupom impresso).
  const chave = texto.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return chave.length === 44 ? { chave, versaoQr: null, tpAmb: undefined } : null;
}

/** Lê o conteúdo do QR Code (ou a chave digitada) e confere a chave, sem acessar a rede. */
export function lerQrNfce(conteudo: string): LeituraNfce {
  const campos = extrairCampos(conteudo);
  if (campos === null || !FORMATO_CHAVE.test(campos.chave)) {
    return { ok: false, erro: 'SEM_CHAVE' };
  }
  const { chave, versaoQr, tpAmb } = campos;
  if (calcularDigitoChave(chave.slice(0, 43)) !== Number(chave[43])) {
    return { ok: false, erro: 'DIGITO_INVALIDO' };
  }
  const codigoUf = chave.slice(0, 2);
  if (!ehSiglaConhecida(codigoUf)) {
    return { ok: false, erro: 'UF_INVALIDA' };
  }
  if (chave.slice(20, 22) !== MODELO_NFCE) {
    return { ok: false, erro: 'NAO_E_NFCE' };
  }

  return {
    ok: true,
    versaoQr,
    ambiente: tpAmb === '1' ? 'producao' : tpAmb === '2' ? 'homologacao' : null,
    nota: {
      chave,
      uf: UFS_POR_CODIGO[codigoUf],
      mesEmissao: `20${chave.slice(2, 4)}-${chave.slice(4, 6)}`,
      cnpjEmitente: chave.slice(6, 20),
      serie: Number(chave.slice(22, 25)),
      numero: Number(chave.slice(25, 34)),
      tipoEmissao: Number(chave.slice(34, 35)),
    },
  };
}
