import type { AppMonitorado, DadosAtualizacaoAppsMonitorados } from '@mony/shared/apps-compra';
import { MAXIMO_APPS_MONITORADOS } from '@mony/shared/apps-compra';
import { requireOptionalNativeModule } from 'expo';
import { AppState } from 'react-native';

/**
 * Módulo nativo `mony-app-usage` (`modules/mony-app-usage`): detecção de apps de compra pelo
 * `UsageStatsManager` do Android, com a verificação periódica do WorkManager (T-022, doc 10). O
 * worker manda cada abertura ao servidor com o token de evento (T-121b), sem o JS. O iOS (Screen
 * Time) é a T-121c.
 */

/** Um app que abre pela tela inicial do aparelho. */
export interface AppDoAparelho {
  /** Pacote no Android, como `com.shopee.br` (o `identificadorApp` de `apps_monitorados`). */
  pacote: string;
  nome: string;
}

/**
 * `ligado`: verificando e com token. `recusado`: o servidor recusou o token (a pessoa saiu em outro
 * lugar, revogou o consentimento ou perdeu o plano pago) e o aparelho parou; liga de novo para pedir
 * outro.
 */
export type EnvioUsoDeApps = 'ligado' | 'desligado' | 'recusado';

export interface EstadoUsoDeApps {
  envio: EnvioUsoDeApps;
  pacotes: string[];
  /** Aberturas na fila esperando rede. */
  pendentes: number;
  ultimaVerificacaoEm: number | null;
  intervaloMinutos: number;
}

export interface ModuloUsoDeApps {
  acessoAoUsoLiberado(): Promise<boolean>;
  /** Abre "Acesso ao uso" nas configurações: a permissão não tem diálogo. */
  abrirConfiguracaoDoAcesso(): Promise<void>;
  listarApps(): Promise<AppDoAparelho[]>;
  /** Guarda o token de evento cifrado (Keystore) e começa a verificação com os apps. */
  ligar(token: string, urlApi: string, pacotes: string[]): Promise<void>;
  /** Troca os apps sem adiar a próxima verificação; desligado, não faz nada. */
  trocarApps(pacotes: string[]): Promise<void>;
  /** Para a verificação e esquece o token e a fila deste aparelho. */
  desligar(): Promise<void>;
  estado(): Promise<EstadoUsoDeApps>;
}

/** `null` no iOS, nos testes e em build sem o módulo (como o Expo Go). */
export const usoDeApps: ModuloUsoDeApps | null =
  requireOptionalNativeModule<ModuloUsoDeApps>('MonyAppUsage');

/** Os pacotes que o aparelho verifica: os ligados na lista do servidor. */
export function pacotesAtivos(lista: readonly AppMonitorado[]): string[] {
  return lista.filter((app) => app.ativo).map((app) => app.identificadorApp);
}

export interface AppParaEscolher extends AppDoAparelho {
  marcado: boolean;
  /** Já está na lista do servidor (os sugeridos do cadastro vêm marcados). */
  naLista: boolean;
}

/**
 * Os apps instalados para a pessoa escolher, com os da lista do servidor primeiro e depois por nome.
 * Os da lista que não estão instalados não aparecem: não há o que verificar neste aparelho.
 */
export function appsParaEscolher(
  lista: readonly AppMonitorado[],
  instalados: readonly AppDoAparelho[],
): AppParaEscolher[] {
  const daLista = new Map(lista.map((app) => [app.identificadorApp, app]));
  return instalados
    .map((app) => {
      const item = daLista.get(app.pacote);
      return { ...app, marcado: item?.ativo ?? false, naLista: item !== undefined };
    })
    .sort((a, b) => Number(b.naLista) - Number(a.naLista) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * O corpo do `PUT /apps-monitorados` (que troca a lista inteira): os instalados marcados ligados, os
 * desmarcados que já estavam na lista desligados (guardam o último alerta) e os da lista que não
 * estão neste aparelho como estão. Até o máximo da API.
 */
export function listaParaSalvar(
  lista: readonly AppMonitorado[],
  instalados: readonly AppDoAparelho[],
  marcados: ReadonlySet<string>,
): DadosAtualizacaoAppsMonitorados {
  const instalado = new Map(instalados.map((app) => [app.pacote, app]));
  const itens: DadosAtualizacaoAppsMonitorados['itens'] = lista.map((app) => ({
    identificadorApp: app.identificadorApp,
    nome: app.nome,
    ativo: instalado.has(app.identificadorApp) ? marcados.has(app.identificadorApp) : app.ativo,
  }));
  const jaNaLista = new Set(lista.map((app) => app.identificadorApp));
  for (const app of instalados) {
    if (marcados.has(app.pacote) && !jaNaLista.has(app.pacote)) {
      itens.push({ identificadorApp: app.pacote, nome: app.nome.slice(0, 80), ativo: true });
    }
  }
  return { itens: itens.slice(0, MAXIMO_APPS_MONITORADOS) };
}

/** O acesso ao uso não tem "negado": sem ele, a pessoa sempre pode ir liberar nas configurações. */
export async function estadoDoAcessoAoUso(
  modulo: ModuloUsoDeApps,
): Promise<'liberada' | 'nao-pedida'> {
  return (await modulo.acessoAoUsoLiberado()) ? 'liberada' : 'nao-pedida';
}

/**
 * O "pedido" do acesso ao uso: abre a tela do sistema e espera a pessoa voltar ao app para conferir
 * se liberou (não há diálogo nem resposta do sistema).
 */
export async function pedirAcessoAoUso(modulo: ModuloUsoDeApps): Promise<boolean> {
  const voltou = new Promise<void>((resolver) => {
    let saiu = false;
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') {
        saiu = true;
        return;
      }
      if (!saiu) return;
      assinatura.remove();
      resolver();
    });
  });
  await modulo.abrirConfiguracaoDoAcesso();
  await voltou;
  return modulo.acessoAoUsoLiberado();
}
