/**
 * Configuração que o app busca ao abrir (`GET /config-app`, docs/arquitetura/04 e 05) e a regra
 * de versão mínima, usada pela API para recusar apps antigos (`VERSAO_APP_DESATUALIZADA`).
 */
import { z } from 'zod';

import { PLATAFORMAS_DISPOSITIVO, type PlataformaDispositivo } from './enums.js';

/** Versão do app no formato `maior.menor.correção` (ex.: `1.4.2`). */
export const REGEX_VERSAO_APP = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** Cabeçalhos que o app manda em toda chamada (doc 04). */
export const CABECALHO_VERSAO_APP = 'x-app-version';
export const CABECALHO_PLATAFORMA = 'x-platform';

/** Negativo se `a` é mais antiga que `b`, zero se iguais, positivo se mais nova. */
export function compararVersoes(a: string, b: string): number {
  const partesA = a.split('.').map(Number);
  const partesB = b.split('.').map(Number);
  for (let indice = 0; indice < 3; indice += 1) {
    const diferenca = (partesA[indice] ?? 0) - (partesB[indice] ?? 0);
    if (diferenca !== 0) return diferenca;
  }
  return 0;
}

/**
 * Se a versão informada pelo app está abaixo da mínima da plataforma. Cabeçalho ausente ou fora
 * do formato não bloqueia (painel admin, ferramentas, testes).
 */
export function versaoAbaixoDaMinima(
  versao: string | undefined,
  plataforma: string | undefined,
  minimas: Record<PlataformaDispositivo, string>,
): boolean {
  if (versao === undefined || !REGEX_VERSAO_APP.test(versao)) return false;
  if (!PLATAFORMAS_DISPOSITIVO.includes(plataforma as PlataformaDispositivo)) return false;
  return compararVersoes(versao, minimas[plataforma as PlataformaDispositivo]) < 0;
}

/** Sugestões iniciais do chat da Mony (provisórias até a T-060 trazer as da conversa). */
export const SUGESTOES_CHAT_PADRAO = [
  'Gastei 35 no almoço',
  'Quanto gastei este mês?',
  'Recebi meu salário',
  'Como está a fatura do cartão?',
] as const;

export const esquemaConfigApp = z.object({
  /** Abaixo dela, o app mostra a tela de atualização obrigatória. */
  versaoMinima: z.object({
    ios: z.string().regex(REGEX_VERSAO_APP),
    android: z.string().regex(REGEX_VERSAO_APP),
  }),
  /** Recursos ligados ou desligados sem nova versão do app. */
  flags: z.record(z.string(), z.boolean()),
  sugestoesChat: z.array(z.string()),
});

export type ConfigApp = z.infer<typeof esquemaConfigApp>;
