import { describe, expect, it } from 'vitest';

import { calcularDigitoChave, lerQrNfce } from './nfce.js';

/** Monta uma chave válida de NFC-e a partir das partes (o dígito é calculado). */
function chave({
  uf = '35',
  anoMes = '2610',
  cnpj = '12345678000195',
  modelo = '65',
  serie = '001',
  numero = '000123456',
  tipoEmissao = '1',
  codigo = '87654321',
} = {}): string {
  const semDigito = `${uf}${anoMes}${cnpj}${modelo}${serie}${numero}${tipoEmissao}${codigo}`;
  return `${semDigito}${String(calcularDigitoChave(semDigito))}`;
}

const CHAVE_SP = chave();

describe('calcularDigitoChave', () => {
  it('módulo 11 com pesos 2 a 9 da direita para a esquerda', () => {
    // 43 posições: "1" seguido de 42 zeros. O "1" fica com peso 2 + (42 mod 8) = 4 → soma 4,
    // resto 4, dígito 11 - 4 = 7.
    expect(calcularDigitoChave(`1${'0'.repeat(42)}`)).toBe(7);
    // Só zeros: resto 0 → dígito 0. Resto 1 também dá 0: "6" com peso 2 soma 12, resto 1.
    expect(calcularDigitoChave('0'.repeat(43))).toBe(0);
    expect(calcularDigitoChave(`${'0'.repeat(42)}6`)).toBe(0);
  });

  it('letras do CNPJ alfanumérico valem o código ASCII menos 48 (A = 17)', () => {
    // "A" na última posição tem peso 2: 17 × 2 = 34, resto 1 → dígito 0.
    expect(calcularDigitoChave(`${'0'.repeat(42)}A`)).toBe(0);
    // "B" (18) com peso 2: 36, resto 3 → dígito 8.
    expect(calcularDigitoChave(`${'0'.repeat(42)}B`)).toBe(8);
  });
});

describe('lerQrNfce', () => {
  it('QR Code versão 3 (emissão normal)', () => {
    const leitura = lerQrNfce(
      `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${CHAVE_SP}|3|1`,
    );
    expect(leitura).toEqual({
      ok: true,
      versaoQr: 3,
      ambiente: 'producao',
      nota: {
        chave: CHAVE_SP,
        uf: 'SP',
        mesEmissao: '2026-10',
        cnpjEmitente: '12345678000195',
        serie: 1,
        numero: 123456,
        tipoEmissao: 1,
      },
    });
  });

  it('QR Code versão 3 em contingência offline', () => {
    const contingencia = chave({ uf: '31', tipoEmissao: '9' });
    const leitura = lerQrNfce(
      `https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=${contingencia}|3|1|09|45.90|1|12345678909|QXNzaW5hdHVyYQ==`,
    );
    expect(leitura).toMatchObject({
      ok: true,
      versaoQr: 3,
      nota: { uf: 'MG', tipoEmissao: 9 },
    });
  });

  it('QR Code versão 2, com o hash do CSC', () => {
    const rs = chave({ uf: '43' });
    expect(
      lerQrNfce(
        `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${rs}|2|1|1|A1B2C3D4E5F60718293A4B5C6D7E8F9012345678`,
      ),
    ).toMatchObject({ ok: true, versaoQr: 2, ambiente: 'producao', nota: { uf: 'RS' } });
  });

  it('QR Code versão 1 (cupons antigos, parâmetro chNFe)', () => {
    const pr = chave({ uf: '41', anoMes: '1905' });
    expect(
      lerQrNfce(
        `http://www.fazenda.pr.gov.br/nfce/qrcode?chNFe=${pr}&nVersao=100&tpAmb=1&vNF=10.00`,
      ),
    ).toMatchObject({
      ok: true,
      versaoQr: 1,
      ambiente: 'producao',
      nota: { uf: 'PR', mesEmissao: '2019-05' },
    });
  });

  it('separador do QR codificado na URL (%7C)', () => {
    expect(lerQrNfce(`https://exemplo.test/consulta?p=${CHAVE_SP}%7C3%7C1`)).toMatchObject({
      ok: true,
      versaoQr: 3,
    });
  });

  it('chave digitada, com espaços como no cupom impresso', () => {
    const digitada = CHAVE_SP.replace(/(.{4})/g, '$1 ').trim();
    expect(lerQrNfce(digitada)).toMatchObject({
      ok: true,
      versaoQr: null,
      ambiente: null,
      nota: { chave: CHAVE_SP },
    });
  });

  it('cupom de homologação (teste do estabelecimento) vem marcado', () => {
    expect(lerQrNfce(`https://exemplo.test/qr?p=${CHAVE_SP}|3|2`)).toMatchObject({
      ok: true,
      ambiente: 'homologacao',
    });
  });

  it('aceita CNPJ alfanumérico (a partir de jul/2026), também em minúsculas', () => {
    const alfanumerica = chave({ cnpj: '12ABC34501DE35' });
    expect(lerQrNfce(`https://exemplo.test/qr?p=${alfanumerica.toLowerCase()}|3|1`)).toMatchObject({
      ok: true,
      nota: { chave: alfanumerica, cnpjEmitente: '12ABC34501DE35' },
    });
  });

  it('recusa letra fora do CNPJ ou no dígito do CNPJ', () => {
    const comLetraNoNumero = `${CHAVE_SP.slice(0, 30)}A${CHAVE_SP.slice(31)}`;
    expect(lerQrNfce(comLetraNoNumero)).toEqual({ ok: false, erro: 'SEM_CHAVE' });
    const comLetraNoDvDoCnpj = `${CHAVE_SP.slice(0, 18)}A${CHAVE_SP.slice(19)}`;
    expect(lerQrNfce(comLetraNoDvDoCnpj)).toEqual({ ok: false, erro: 'SEM_CHAVE' });
  });

  it('recusa chave com o dígito verificador errado', () => {
    const errada = `${CHAVE_SP.slice(0, 43)}${String((Number(CHAVE_SP[43]) + 1) % 10)}`;
    expect(lerQrNfce(`https://exemplo.test/qr?p=${errada}|3|1`)).toEqual({
      ok: false,
      erro: 'DIGITO_INVALIDO',
    });
  });

  it('recusa NF-e (modelo 55) e UF inexistente', () => {
    expect(lerQrNfce(chave({ modelo: '55' }))).toEqual({ ok: false, erro: 'NAO_E_NFCE' });
    expect(lerQrNfce(chave({ uf: '99' }))).toEqual({ ok: false, erro: 'UF_INVALIDA' });
  });

  it('recusa o que não é cupom', () => {
    for (const conteudo of [
      '',
      'https://exemplo.test/promocao?id=10',
      'https://exemplo.test/qr?p=123|3|1',
      'texto qualquer',
      CHAVE_SP.slice(0, 43),
    ]) {
      expect(lerQrNfce(conteudo)).toEqual({ ok: false, erro: 'SEM_CHAVE' });
    }
  });
});
