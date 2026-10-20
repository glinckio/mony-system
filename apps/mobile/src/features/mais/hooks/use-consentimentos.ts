import { revogarConsentimentos, useListarConsentimentos } from '@mony/api-client';
import type { FinalidadeConsentimento } from '@mony/shared/enums';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/** Os consentimentos de cada finalidade (`GET /consentimentos`, T-140d). */
export function useConsentimentos() {
  return useListarConsentimentos();
}

/**
 * `DELETE /consentimentos/:finalidade`: revoga e o servidor desliga o recurso (agendas, apps de
 * compra, ligação nos lembretes). Tudo o que o app mostra pode ter mudado, então tudo é buscado de
 * novo.
 */
export function useRevogarConsentimento() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (finalidade: FinalidadeConsentimento) => revogarConsentimentos(finalidade),
    onSuccess: () => cliente.invalidateQueries(),
  });
}
