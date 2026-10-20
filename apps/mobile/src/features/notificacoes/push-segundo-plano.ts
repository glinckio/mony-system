import {
  adiarLembretes,
  clienteConfigurado,
  concluirLembretes,
  configurarCliente,
  emitirTokenSegundoPlano,
  ErroApi,
  marcarLidaNotificacoes,
} from '@mony/api-client';
import { PUSH_SINCRONIZAR_ALARMES } from '@mony/shared/notificacoes';
import * as Notifications from 'expo-notifications';

import {
  sincronizarAlarmesDoServidor,
  textosDoAlarme,
} from '@/features/lembretes/hooks/use-alarmes-locais';
import { cabecalhosDoApp, prepararAparelho } from '@/lib/auth/aparelho';
import { cofre } from '@/lib/auth/cofre';
import { configApp } from '@/lib/config';
import { acaoDoPush } from '@/lib/push';
import { relogio } from '@/lib/relogio';
import { chaveDoToque, liberarToque, reservarToque } from '@/lib/toques-push';

/*
 * O push com o app fechado (T-088b, doc 09). A tarefa roda sem a tela, às vezes sem o app ter
 * aberto nesta vida do processo:
 * - **Push silencioso** (`sincronizar_alarmes`): troca a agenda de alarmes do aparelho, nos dois
 *   sistemas.
 * - **[Feito] e [Adiar]** do lembrete: só no Android, onde os botões não abrem o app e o sistema
 *   entrega o toque à tarefa. No iOS, a tarefa não recebe toques e os botões continuam abrindo o
 *   app (`prepararPush`).
 * Ela não usa a sessão do app: renovar aqui e no app ao mesmo tempo derrubaria a sessão (RN-004).
 * Usa o token de segundo plano do aparelho, que o app pede a cada abertura e guarda no cofre.
 */

/** O nome da tarefa no `expo-task-manager`. */
export const TAREFA_PUSH = 'mony-push-segundo-plano';

/** O que a tarefa recebeu e vai fazer. */
export type PedidoDoSegundoPlano =
  | { tipo: 'sincronizar' }
  | {
      tipo: 'feito' | 'adiar';
      lembreteId: string;
      ocorrencia: string | null;
      notificacaoId: string | null;
      /** A notificação no aparelho, para tirá-la da barra depois da ação. */
      identificador: string;
      chave: string;
    }
  | { tipo: 'nada' };

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : null;
}

/** Texto JSON de um objeto, ou `null`. */
function objetoDoTexto(valor: unknown): Record<string, unknown> | null {
  if (typeof valor !== 'string') return null;
  try {
    return objeto(JSON.parse(valor));
  } catch {
    return null;
  }
}

/**
 * Os dados do push recebido. O Expo entrega o `data` do envio em `dataString` (JSON); versões
 * anteriores o punham em `body`; e alguns caminhos entregam os campos soltos.
 */
function dadosDoRecebido(dados: Record<string, unknown>): Record<string, unknown> {
  return objetoDoTexto(dados.dataString) ?? objetoDoTexto(dados.body) ?? dados;
}

/** Interpreta o que o sistema entregou à tarefa (`NotificationTaskPayload`). */
export function pedidoDoSegundoPlano(carga: unknown): PedidoDoSegundoPlano {
  const raiz = objeto(carga);
  if (raiz === null) return { tipo: 'nada' };
  // Toque num botão (Android, com o app fora da frente): é uma `NotificationResponse`.
  if (typeof raiz.actionIdentifier === 'string') {
    const pedido = objeto(objeto(raiz.notification)?.request);
    const identificador = pedido?.identifier;
    const dados = objeto(objeto(pedido?.content)?.data) ?? {};
    if (typeof identificador !== 'string') return { tipo: 'nada' };
    const acao = acaoDoPush(raiz.actionIdentifier, dados);
    if (acao.tipo !== 'feito' && acao.tipo !== 'adiar') return { tipo: 'nada' };
    return {
      tipo: acao.tipo,
      lembreteId: acao.lembreteId,
      ocorrencia: acao.ocorrencia,
      notificacaoId: typeof dados.notificacaoId === 'string' ? dados.notificacaoId : null,
      identificador,
      chave: chaveDoToque(identificador, raiz.actionIdentifier),
    };
  }
  const dados = objeto(raiz.data);
  if (dados !== null && dadosDoRecebido(dados).tipo === PUSH_SINCRONIZAR_ALARMES) {
    return { tipo: 'sincronizar' };
  }
  return { tipo: 'nada' };
}

/**
 * Pede um token de segundo plano novo e o guarda no cofre. O app chama a cada abertura com a
 * sessão aberta: o token vale até o fim da sessão, e a sessão anda a cada renovação. Sem rede, fica
 * o de antes.
 */
export async function renovarTokenSegundoPlano(): Promise<boolean> {
  try {
    await cofre.gravarSegundoPlano(await emitirTokenSegundoPlano());
    return true;
  } catch {
    return false;
  }
}

/** O token guardado, se ainda vale. */
async function tokenValido(): Promise<string | null> {
  const guardado = await cofre.lerSegundoPlano().catch(() => null);
  if (guardado === null) return null;
  return Date.parse(guardado.expiraEm) > relogio.agora().getTime() ? guardado.token : null;
}

/**
 * Sem o app aberto nesta vida do processo, o cliente da API ainda não tem a URL: a tarefa põe só a
 * URL e os cabeçalhos do app (versão, plataforma e aparelho), sem token nem renovação. Com o app
 * aberto, fica a configuração dele: o token de segundo plano vai em cada chamada e vence o do app.
 */
async function prepararCliente(): Promise<void> {
  await prepararAparelho();
  if (!clienteConfigurado()) {
    configurarCliente({ urlBase: configApp.urlApi, cabecalhos: cabecalhosDoApp });
  }
}

/** Respostas que dizem que o token de segundo plano não vale mais: ele sai do cofre. */
function tokenRecusado(erro: unknown): boolean {
  return erro instanceof ErroApi && erro.status === 401;
}

type Resultado = Notifications.BackgroundNotificationTaskResult;

/**
 * O que a tarefa faz. Nunca lança: a tarefa roda sem ninguém olhando. `NewData` quando fez algo,
 * `NoData` quando não havia o que fazer (ou sem token), `Failed` quando a API ou a rede falharam.
 */
export async function executarTarefaPush(carga: unknown): Promise<Resultado> {
  const { NewData, NoData, Failed } = Notifications.BackgroundNotificationTaskResult;
  const pedido = pedidoDoSegundoPlano(carga);
  if (pedido.tipo === 'nada') return NoData;
  const token = await tokenValido();
  if (token === null) return NoData;
  await prepararCliente();
  const opcoes: RequestInit = { headers: { authorization: `Bearer ${token}` } };

  if (pedido.tipo === 'sincronizar') {
    try {
      return (await sincronizarAlarmesDoServidor(textosDoAlarme(), opcoes)) ? NewData : NoData;
    } catch (erro) {
      if (tokenRecusado(erro)) await cofre.apagarSegundoPlano().catch(() => undefined);
      return Failed;
    }
  }

  // O mesmo toque também chega ao ouvinte do app (app em segundo plano) e volta como a última
  // resposta quando ele abre: quem reserva primeiro age.
  if (!(await reservarToque(pedido.chave))) return NoData;
  try {
    if (pedido.tipo === 'feito') {
      await concluirLembretes(
        pedido.lembreteId,
        pedido.ocorrencia === null ? {} : { ocorrencia: pedido.ocorrencia },
        opcoes,
      );
    } else {
      await adiarLembretes(pedido.lembreteId, { opcao: '10min' }, opcoes);
    }
  } catch (erro) {
    if (tokenRecusado(erro)) await cofre.apagarSegundoPlano().catch(() => undefined);
    // A notificação fica na barra: tocar no corpo abre o lembrete, e o app faz por lá. Sem rede,
    // o toque volta a ficar livre.
    if (!(erro instanceof ErroApi && erro.status < 500)) await liberarToque(pedido.chave);
    return Failed;
  }
  // O botão que não abre o app não tira a notificação da barra.
  await Notifications.dismissNotificationAsync(pedido.identificador).catch(() => undefined);
  if (pedido.notificacaoId !== null) {
    await marcarLidaNotificacoes(pedido.notificacaoId, opcoes).catch(() => undefined);
  }
  await sincronizarAlarmesDoServidor(textosDoAlarme(), opcoes).catch(() => false);
  return NewData;
}
