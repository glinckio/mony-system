import {
  checkoutAssinaturas,
  ErroApi,
  getSituacaoAssinaturasQueryKey,
  getUsoAssinaturaQueryKey,
  portalAssinaturas,
  situacaoAssinaturas,
} from '@mony/api-client';
import type { PlanoPago } from '@mony/shared/enums';
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';

/**
 * Para onde a Stripe devolve a pessoa: a API (`/v1/assinatura/retorno`) redireciona para
 * `mony://planos?checkout=…`, e o navegador do app fecha ao ver esse endereço (doc 10).
 */
export const URL_RETORNO_COBRANCA = 'mony://planos';

/** De quanto em quanto tempo o app pergunta se o plano já foi liberado, depois do pagamento. */
export const INTERVALO_CONFIRMACAO_MS = 1_500;
/** Quantas vezes pergunta (30 s) antes de dizer que a confirmação está demorando. */
export const TENTATIVAS_CONFIRMACAO = 20;

/**
 * `abrindo`: pedindo o checkout ou com a página da Stripe aberta; `confirmando`: a pessoa pagou e o
 * app espera o webhook liberar o plano (RN-128); `pago`: liberado; `demorando`: pagou, mas a
 * liberação não chegou nos 30 s.
 */
export type EtapaAssinatura = 'parado' | 'abrindo' | 'confirmando' | 'pago' | 'demorando';

const esperar = (ms: number) =>
  new Promise<void>((resolver) => {
    setTimeout(resolver, ms);
  });

/**
 * Assinar (T-103): pede a sessão do Stripe Checkout (`POST /assinatura/checkout`), abre no navegador
 * do app e, na volta, pergunta `GET /assinatura` até o plano pago aparecer (RN-128). Quem decide se
 * pagou é o servidor, pelo webhook; a volta só diz quando perguntar. Fechar o navegador sem a volta
 * de sucesso (a pessoa cancelou, ou o aparelho não abriu o `mony://`) pergunta uma vez só.
 */
export function useAssinar() {
  const cliente = useQueryClient();
  const [etapa, definirEtapa] = useState<EtapaAssinatura>('parado');
  const [erro, definirErro] = useState<ErroApi | Error | null>(null);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  // Função, e não `montado.current` direto: o valor muda entre os `await`.
  const ativo = () => montado.current;

  /** `true` quando a API já mostra o plano pago; atualiza as telas que mostram o plano. */
  async function liberado(): Promise<boolean> {
    const situacao = await situacaoAssinaturas();
    cliente.setQueryData(getSituacaoAssinaturasQueryKey(), situacao);
    if (situacao.plano !== 'mensal' && situacao.plano !== 'anual') return false;
    await cliente.invalidateQueries({ queryKey: getUsoAssinaturaQueryKey() });
    return true;
  }

  async function assinar(plano: PlanoPago) {
    definirErro(null);
    definirEtapa('abrindo');
    try {
      const { url } = await checkoutAssinaturas({ plano });
      const resultado = await WebBrowser.openAuthSessionAsync(url, URL_RETORNO_COBRANCA);
      if (!ativo()) return;
      const pagou = resultado.type === 'success' && resultado.url.includes('checkout=sucesso');
      if (!pagou) {
        definirEtapa((await liberado()) ? 'pago' : 'parado');
        return;
      }
      definirEtapa('confirmando');
      for (let tentativa = 0; tentativa < TENTATIVAS_CONFIRMACAO; tentativa += 1) {
        if (await liberado()) {
          if (ativo()) definirEtapa('pago');
          return;
        }
        await esperar(INTERVALO_CONFIRMACAO_MS);
        if (!ativo()) return;
      }
      definirEtapa('demorando');
    } catch (falha) {
      if (!ativo()) return;
      definirErro(falha instanceof Error ? falha : new Error(String(falha)));
      definirEtapa('parado');
    }
  }

  return {
    etapa,
    erro,
    /** Quem já tem plano pago troca pelo portal; a tela leva para "Seu plano". */
    jaAssina: erro instanceof ErroApi && erro.codigo === 'ASSINATURA_JA_ATIVA',
    assinar: (plano: PlanoPago) => void assinar(plano),
  };
}

/**
 * O portal da Stripe (`POST /assinatura/portal`): trocar de plano ou de cartão, ver faturas e
 * cancelar. Na volta, busca o plano de novo, porque a mudança chega pelo webhook.
 */
export function usePortal() {
  const cliente = useQueryClient();
  const [abrindo, definirAbrindo] = useState(false);
  const [erro, definirErro] = useState(false);

  async function abrir() {
    definirErro(false);
    definirAbrindo(true);
    try {
      const { url } = await portalAssinaturas();
      await WebBrowser.openAuthSessionAsync(url, URL_RETORNO_COBRANCA);
      await Promise.all([
        cliente.invalidateQueries({ queryKey: getSituacaoAssinaturasQueryKey() }),
        cliente.invalidateQueries({ queryKey: getUsoAssinaturaQueryKey() }),
      ]);
    } catch {
      definirErro(true);
    } finally {
      definirAbrindo(false);
    }
  }

  return { abrir: () => void abrir(), abrindo, erro };
}
