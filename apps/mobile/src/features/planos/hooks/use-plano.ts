import { useUsoAssinatura } from '@mony/api-client';

/**
 * O plano que vale agora e, no gratuito, o uso de cada limite (`GET /assinatura/uso`, RN-120).
 * Sempre busca de novo ao abrir: o uso muda a cada lançamento e mensagem.
 */
export function usePlano() {
  return useUsoAssinatura({ query: { staleTime: 0 } });
}
