import AsyncStorage from '@react-native-async-storage/async-storage';

import { relogio } from './relogio';

/*
 * O mesmo toque num botão do push pode chegar duas vezes (T-088b): no Android, a tarefa de
 * segundo plano e o ouvinte do app recebem o mesmo [Feito] quando o app está fora da frente, e a
 * última resposta volta quando o app abre. Quem age primeiro reserva o toque; o outro não faz nada.
 * A reserva fica na memória (a tarefa e o app no mesmo JS) e no aparelho (a tarefa rodou sem o app,
 * e o app abre depois).
 */

const CHAVE = 'mony.push.toques';
/** Quantos toques o aparelho lembra, e por quanto tempo. */
const LIMITE = 50;
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

interface Toque {
  chave: string;
  em: number;
}

const naMemoria = new Set<string>();

async function lerGuardados(): Promise<Toque[]> {
  try {
    const texto = await AsyncStorage.getItem(CHAVE);
    const lidos: unknown = texto === null ? [] : JSON.parse(texto);
    return Array.isArray(lidos)
      ? lidos.filter(
          (toque): toque is Toque =>
            typeof (toque as Toque).chave === 'string' && typeof (toque as Toque).em === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

async function gravar(toques: Toque[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(toques));
  } catch {
    // Sem o armazenamento, vale a memória: no pior caso, a mesma ação chega duas vezes à API.
  }
}

/** A chave do toque: a notificação e o botão (o [Adiar] depois do [Feito] é outro toque). */
export function chaveDoToque(identificador: string, acao: string): string {
  return `${identificador}:${acao}`;
}

/**
 * Reserva o toque para quem chama. `false` se ele já foi (ou está sendo) tratado. A reserva na
 * memória é feita antes de qualquer espera, para duas chamadas juntas não passarem as duas.
 */
export async function reservarToque(chave: string): Promise<boolean> {
  if (naMemoria.has(chave)) return false;
  naMemoria.add(chave);
  const agora = relogio.agora().getTime();
  const guardados = (await lerGuardados()).filter((toque) => agora - toque.em < VALIDADE_MS);
  if (guardados.some((toque) => toque.chave === chave)) return false;
  await gravar([...guardados, { chave, em: agora }].slice(-LIMITE));
  return true;
}

/** Devolve o toque que falhou (sem rede, por exemplo): o app pode tentar de novo quando abrir. */
export async function liberarToque(chave: string): Promise<void> {
  naMemoria.delete(chave);
  await gravar((await lerGuardados()).filter((toque) => toque.chave !== chave));
}

/** Só para testes: esquece os toques da memória (os do aparelho saem com o `AsyncStorage.clear`). */
export function esquecerToquesEmMemoria(): void {
  naMemoria.clear();
}
