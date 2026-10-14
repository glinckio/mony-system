import { registrarDispositivoUsuarios } from '@mony/api-client';
import { CANAIS_ANDROID, type CanalAndroid } from '@mony/shared/notificacoes';
import Constants from 'expo-constants';
import type { Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { rotaDoLink } from './links-internos';

/*
 * Push no aparelho (doc 04, "Notificações no aparelho"; doc 09; T-088): permissão, token do Expo,
 * canais do Android, categorias de ação e o que fazer com o toque. A API manda o `linkInterno`,
 * a categoria (`lembrete`, `fatura_atrasada`) e o canal em cada push (T-081).
 */

/** Os botões das notificações (`CATEGORIAS_ACAO` da API). */
export const ACOES_PUSH = { feito: 'feito', adiar: 'adiar', paguei: 'paguei' } as const;

/** Textos que o sistema mostra: nomes dos canais e botões, do i18n do app. */
export interface TextosPush {
  canais: Record<Exclude<CanalAndroid, 'alarmes'>, string>;
  feito: string;
  adiar: string;
  paguei: string;
}

/** Os canais que o app cria; o `alarmes` é do `mony-alarm` (T-023a), com o som de alarme. */
const IMPORTANCIA: Record<Exclude<CanalAndroid, 'alarmes'>, Notifications.AndroidImportance> = {
  alertas: Notifications.AndroidImportance.HIGH,
  lembretes: Notifications.AndroidImportance.MAX,
  novidades: Notifications.AndroidImportance.DEFAULT,
};

/**
 * Na abertura: o push aparece também com o app aberto; os canais do Android existem antes do
 * primeiro push (o Android não mostra push de canal que o app não criou); e as categorias com os
 * botões. Os botões abrem o app, que faz a ação: com o app fechado, um botão que não abre não é
 * entregue ao JS.
 */
export async function prepararPush(textos: TextosPush): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
  });
  if (Platform.OS === 'android') {
    for (const canal of CANAIS_ANDROID) {
      if (canal === 'alarmes') continue;
      await Notifications.setNotificationChannelAsync(canal, {
        name: textos.canais[canal],
        importance: IMPORTANCIA[canal],
      });
    }
  }
  await Notifications.setNotificationCategoryAsync('lembrete', [
    { identifier: ACOES_PUSH.feito, buttonTitle: textos.feito },
    { identifier: ACOES_PUSH.adiar, buttonTitle: textos.adiar },
  ]);
  await Notifications.setNotificationCategoryAsync('fatura_atrasada', [
    { identifier: ACOES_PUSH.paguei, buttonTitle: textos.paguei },
  ]);
}

/** O estado da permissão de notificações, como a tela de Permissões mostra. */
export async function estadoDaPermissaoDePush(): Promise<'liberada' | 'negada' | 'nao-pedida'> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === Notifications.PermissionStatus.GRANTED) return 'liberada';
  return status === Notifications.PermissionStatus.DENIED ? 'negada' : 'nao-pedida';
}

/** Pede a permissão (o diálogo do sistema) e, liberada, registra o token. */
export async function pedirPermissaoDePush(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  const liberada = status === Notifications.PermissionStatus.GRANTED;
  if (liberada) await registrarTokenDePush();
  return liberada;
}

function idDoProjeto(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

/**
 * Doc 09: grava o token do Expo neste aparelho (`POST /me/dispositivos`), ao abrir o app e quando
 * o token do sistema troca. Só com a permissão liberada. O projeto do EAS vai junto quando existe
 * (no build do EAS, o Expo exige).
 */
export async function registrarTokenDePush(): Promise<boolean> {
  try {
    if ((await estadoDaPermissaoDePush()) !== 'liberada') return false;
    const projectId = idDoProjeto();
    const { data: tokenPush } = await Notifications.getExpoPushTokenAsync(
      projectId === null ? undefined : { projectId },
    );
    await registrarDispositivoUsuarios({ tokenPush });
    return true;
  } catch {
    // Sem rede, sem o serviço do Google ou sem o projeto: a próxima abertura tenta de novo.
    return false;
  }
}

/** O que fazer com um toque numa notificação (no corpo ou num botão). */
export type AcaoDoPush =
  | { tipo: 'abrir'; rota: Href }
  | { tipo: 'feito' | 'adiar'; lembreteId: string; ocorrencia: string | null; rota: Href }
  | { tipo: 'paguei'; faturaId: string; chave: string; rota: Href }
  | { tipo: 'nada' };

const ID = '[0-9a-fA-F-]{36}';
const LEMBRETE = new RegExp(`^mony://lembretes/(${ID})(?:\\?ocorrencia=(\\d+))?$`);
const FATURA = new RegExp(`^mony://cartoes/${ID}/faturas/(${ID})$`);

/**
 * RN-105: o toque abre o `linkInterno`. [Feito] e [Adiar] (lembrete) levam o id e a ocorrência do
 * link (`?ocorrencia=<ms>`, T-084a); [Paguei] (fatura atrasada) paga a fatura do link com uma
 * chave por notificação, para o toque repetido não pagar duas vezes. Link que o app não conhece não
 * faz nada.
 */
export function acaoDoPush(acao: string, dados: Record<string, unknown>): AcaoDoPush {
  const link = typeof dados.linkInterno === 'string' ? dados.linkInterno : null;
  const rota = link === null ? null : rotaDoLink(link);
  if (link === null || rota === null) return { tipo: 'nada' };
  if (acao === ACOES_PUSH.feito || acao === ACOES_PUSH.adiar) {
    const [, lembreteId, ms] = LEMBRETE.exec(link) ?? [];
    if (lembreteId !== undefined) {
      return {
        tipo: acao,
        lembreteId,
        ocorrencia: ms === undefined ? null : new Date(Number(ms)).toISOString(),
        rota,
      };
    }
  }
  if (acao === ACOES_PUSH.paguei) {
    const [, faturaId] = FATURA.exec(link) ?? [];
    const notificacao = typeof dados.notificacaoId === 'string' ? dados.notificacaoId : faturaId;
    if (faturaId !== undefined) {
      return { tipo: 'paguei', faturaId, chave: `paguei-${notificacao ?? faturaId}`, rota };
    }
  }
  return { tipo: 'abrir', rota };
}
