import { formatarCentavos } from '@mony/shared/dinheiro';

import { Campo } from './campo';

/** Até R$ 999.999.999,99: o limite da API é R$ 1 bilhão por lançamento. */
const MAXIMO_DIGITOS = 11;

export interface PropsCampoValor {
  rotulo: string;
  /** Centavos inteiros; 0 deixa o campo vazio. */
  centavos: number;
  aoMudar: (centavos: number) => void;
  erro?: string | null;
  editavel?: boolean;
  testID?: string;
}

/** Dígitos digitados → centavos: "1050" é R$ 10,50. Sem vírgula, sem ponto flutuante. */
export function digitosParaCentavos(texto: string): number {
  const digitos = texto.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAXIMO_DIGITOS);
  return digitos === '' ? 0 : Number(digitos);
}

/**
 * Campo de dinheiro: a pessoa digita só números e o valor aparece formatado em reais enquanto ela
 * digita, como nos apps de banco ("1050" → "R$ 10,50").
 */
export function CampoValor({
  rotulo,
  centavos,
  aoMudar,
  erro,
  editavel = true,
  testID,
}: PropsCampoValor) {
  return (
    <Campo
      rotulo={rotulo}
      value={centavos === 0 ? '' : formatarCentavos(centavos)}
      placeholder={formatarCentavos(0)}
      onChangeText={(texto) => {
        aoMudar(digitosParaCentavos(texto));
      }}
      keyboardType="number-pad"
      erro={erro}
      editable={editavel}
      testID={testID}
    />
  );
}
