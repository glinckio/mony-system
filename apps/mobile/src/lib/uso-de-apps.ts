import { requireOptionalNativeModule } from 'expo';

/**
 * Módulo nativo `mony-app-usage` (`modules/mony-app-usage`): detecção de apps de compra pelo
 * `UsageStatsManager` do Android, com a verificação periódica do WorkManager (T-022, docs/arquitetura/10).
 * O iOS (Screen Time) é a T-021.
 */

/** Um app que abre pela tela inicial do aparelho. */
export interface AppDoAparelho {
  /** Pacote no Android, como `com.shopee.br` (o `identificadorApp` de `apps_monitorados`). */
  pacote: string;
  nome: string;
}

/** Uma passada da verificação, periódica ou pedida na tela de teste. Instantes em ms desde 1970. */
export interface ExecucaoVerificacao {
  inicioEm: number;
  origem: 'periodica' | 'manual';
  acessoAoUso: boolean;
  /** Janela lida: `[desde, ate)`. */
  desde: number;
  ate: number;
  /** Eventos dos apps monitorados na janela. */
  eventos: number;
  aberturas: number;
  duracaoMs: number;
  erro: string | null;
}

export interface DeteccaoApp {
  pacote: string;
  nome: string;
  abertoEm: number;
  /** Quando a verificação achou a abertura: a diferença é o atraso da detecção. */
  detectadoEm: number;
}

export interface EstadoUsoDeApps {
  monitorando: boolean;
  pacotes: string[];
  ultimaVerificacaoEm: number | null;
  /** Quando o WorkManager pretende rodar a próxima (o Doze pode atrasar). */
  proximaVerificacaoEm: number | null;
  intervaloMinutos: number;
  /** Da mais antiga para a mais recente. */
  execucoes: ExecucaoVerificacao[];
  deteccoes: DeteccaoApp[];
}

export interface ModuloUsoDeApps {
  acessoAoUsoLiberado(): Promise<boolean>;
  /** Abre "Acesso ao uso" nas configurações: a permissão não tem diálogo. */
  abrirConfiguracaoDoAcesso(): Promise<void>;
  notificacoesLigadas(): Promise<boolean>;
  abrirConfiguracaoDeNotificacoes(): Promise<void>;
  listarApps(): Promise<AppDoAparelho[]>;
  /** Liga (ou troca a lista de apps) sem adiar a próxima verificação. */
  iniciar(pacotes: string[]): Promise<void>;
  parar(): Promise<void>;
  /** Pede uma verificação já; o resultado aparece no `estado` quando o WorkManager rodar. */
  verificarAgora(): Promise<void>;
  limparHistorico(): Promise<void>;
  estado(): Promise<EstadoUsoDeApps>;
}

/** `null` no iOS, nos testes e em build sem o módulo (como o Expo Go). */
export const usoDeApps: ModuloUsoDeApps | null =
  requireOptionalNativeModule<ModuloUsoDeApps>('MonyAppUsage');

const MINUTO = 60_000;

/** Quantos minutos depois de aberto o app a verificação achou a abertura. */
export function atrasoEmMinutos(deteccao: DeteccaoApp): number {
  return Math.max(0, Math.round((deteccao.detectadoEm - deteccao.abertoEm) / MINUTO));
}

function mediana(ordenados: readonly number[]): number {
  const meio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[meio] ?? 0;
  return Math.round(((ordenados[meio - 1] ?? 0) + (ordenados[meio] ?? 0)) / 2);
}

/** O que a PoC quer medir: quanto tempo depois de abrir o app a detecção acontece. */
export function resumoDosAtrasos(
  deteccoes: readonly DeteccaoApp[],
): { quantidade: number; medianaMin: number; maiorMin: number } | null {
  const atrasos = deteccoes.map(atrasoEmMinutos).sort((a, b) => a - b);
  if (atrasos.length === 0) return null;
  return {
    quantidade: atrasos.length,
    medianaMin: mediana(atrasos),
    maiorMin: atrasos[atrasos.length - 1] ?? 0,
  };
}

/**
 * Minutos entre verificações periódicas seguidas. Com o aparelho parado, o Doze e o balde de espera
 * do app espaçam as execuções além dos 15 min pedidos: é o outro número que a PoC mede.
 */
export function intervalosEntreVerificacoes(execucoes: readonly ExecucaoVerificacao[]): number[] {
  const inicios = execucoes
    .filter((execucao) => execucao.origem === 'periodica')
    .map((execucao) => execucao.inicioEm)
    .sort((a, b) => a - b);
  return inicios
    .slice(1)
    .map((inicio, indice) => Math.round((inicio - (inicios[indice] ?? inicio)) / MINUTO));
}

/** "14:03" no fuso do aparelho, sem `Intl` (varia no Hermes; ver T-003). */
export function horaDoAparelho(instante: number): string {
  const data = new Date(instante);
  return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}
