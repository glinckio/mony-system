import { ErroApi, renovarAutenticacao, sairAutenticacao } from '@mony/api-client';
import type { Sessao } from '@mony/shared/autenticacao';
import * as Sentry from '@sentry/react-native';

import { useSessao } from '@/stores/sessao';

import { prepararAparelho } from './aparelho';
import { cofre } from './cofre';

/** Sessão nova (login, cadastro, renovação): renovação no cofre, acesso só em memória (doc 04). */
export async function comecarSessao(sessao: Sessao): Promise<void> {
  await cofre.gravarRenovacao(sessao.tokens.renovacao);
  const { id, nome, onboardingConcluido } = sessao.usuario;
  useSessao.getState().iniciar({ id, nome, onboardingConcluido }, sessao.tokens.acesso);
}

/**
 * Esquece a sessão neste aparelho (sem falar com a API), com o token de segundo plano (T-088b):
 * a API também o derruba junto com a sessão, mas sem rede ele ficaria no cofre.
 */
export async function encerrarSessaoLocal(): Promise<void> {
  await cofre.apagarRenovacao();
  await cofre.apagarSegundoPlano().catch(() => undefined);
  useSessao.getState().encerrar();
}

/**
 * Respostas em que a API recusou o token de renovação (inválido, revogado, reusado, conta
 * bloqueada). Nas outras (sem rede, 5xx, 426 de versão antiga, 429), o token continua guardado.
 */
const RENOVACAO_RECUSADA = new Set([400, 401, 403]);

/**
 * Troca o token de renovação guardado por uma sessão nova (RN-004: o antigo deixa de valer). Se a
 * API recusa, a sessão acabou e sai do aparelho; sem rede, o token fica para a próxima tentativa.
 * `true` se há token de acesso novo.
 */
export async function renovarSessao(): Promise<boolean> {
  const renovacao = await cofre.lerRenovacao();
  if (!renovacao) {
    useSessao.getState().encerrar();
    return false;
  }
  try {
    await comecarSessao(await renovarAutenticacao({ renovacao }));
    return true;
  } catch (erro) {
    if (erro instanceof ErroApi && RENOVACAO_RECUSADA.has(erro.status)) await encerrarSessaoLocal();
    return false;
  }
}

let restauracao: Promise<void> | null = null;

/**
 * Na abertura do app: sem sessão guardada, vai para o login; com biometria ligada, espera o
 * desbloqueio (RN-005); senão, renova direto. Roda uma vez só: chamadas repetidas (a raiz montada
 * de novo, por exemplo) esperam a mesma restauração, e depois dela não fazem nada. Duas
 * renovações com o mesmo token seriam reuso (RN-004) e derrubariam a sessão.
 */
export function restaurarSessao(): Promise<void> {
  if (useSessao.getState().estado !== 'iniciando') return Promise.resolve();
  restauracao ??= restaurar()
    .catch(async (erro: unknown) => {
      // Cofre ilegível (acontece no Keystore do Android): melhor pedir login do que travar.
      Sentry.captureException(erro);
      await cofre.apagarRenovacao().catch(() => undefined);
      useSessao.getState().encerrar();
    })
    .finally(() => {
      restauracao = null;
    });
  return restauracao;
}

async function restaurar(): Promise<void> {
  await prepararAparelho();
  const renovacao = await cofre.lerRenovacao();
  if (!renovacao) {
    useSessao.getState().definirEstado('pronta');
    return;
  }
  if (await cofre.biometriaLigada()) {
    useSessao.getState().definirEstado('bloqueada');
    return;
  }
  await desbloquearSessao();
}

/** Depois da biometria (ou sem ela): renova e libera a navegação, com ou sem usuário. */
export async function desbloquearSessao(): Promise<void> {
  await renovarSessao();
  useSessao.getState().definirEstado('pronta');
}

/** Sair deste aparelho: a API revoga a renovação; sem rede, sai do aparelho mesmo assim. */
export async function sair(): Promise<void> {
  const renovacao = await cofre.lerRenovacao();
  if (renovacao) await sairAutenticacao({ renovacao }).catch(() => undefined);
  await encerrarSessaoLocal();
}
