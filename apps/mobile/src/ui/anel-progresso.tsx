import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Texto } from './texto';
import { cores } from './tokens';

export interface PropsAnelProgresso {
  feitos: number;
  total: number;
  /** O que o anel mede, para o leitor de tela ("2 de 5 passos feitos"). */
  rotulo: string;
  /** Diâmetro em pt. */
  tamanho?: number;
}

const ESPESSURA = 6;

/** Anel de progresso com "2/5" no meio, como no "Termine de configurar" do design. */
export function AnelProgresso({ feitos, total, rotulo, tamanho = 56 }: PropsAnelProgresso) {
  const raio = (tamanho - ESPESSURA) / 2;
  const centro = tamanho / 2;
  const circunferencia = 2 * Math.PI * raio;
  const fracao = total > 0 ? Math.min(1, Math.max(0, feitos / total)) : 0;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={rotulo}
      accessibilityValue={{ min: 0, max: total, now: feitos }}
      className="items-center justify-center"
      style={{ width: tamanho, height: tamanho }}
    >
      {/* Girado para o arco começar no topo, como um relógio. */}
      <Svg
        width={tamanho}
        height={tamanho}
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}
      >
        <Circle
          cx={centro}
          cy={centro}
          r={raio}
          stroke={cores['superficie-alta']}
          strokeWidth={ESPESSURA}
          fill="none"
        />
        <Circle
          cx={centro}
          cy={centro}
          r={raio}
          stroke={cores.primaria}
          strokeWidth={ESPESSURA}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${String(circunferencia)} ${String(circunferencia)}`}
          strokeDashoffset={circunferencia * (1 - fracao)}
        />
      </Svg>
      <Texto variante="corpo-sm" className="font-negrito">
        {`${String(feitos)}/${String(total)}`}
      </Texto>
    </View>
  );
}
