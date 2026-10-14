import { useEffect, useState } from 'react';

import { estadoDaPermissaoDePush, pedirPermissaoDePush } from './push';

/**
 * Permissões do aparelho que a Mony usa (doc 04, "Permissões"), pedidas uma por vez com a tela
 * explicativa antes do diálogo do sistema. Recusa nunca bloqueia o app.
 */
export const PERMISSOES = ['notificacoes', 'agenda', 'apps-de-compra', 'banco'] as const;
export type Permissao = (typeof PERMISSOES)[number];

/** `indisponivel`: este build ainda não tem o módulo que pede a permissão. */
export type EstadoPermissao = 'liberada' | 'negada' | 'nao-pedida' | 'indisponivel';

export interface PedidoDePermissao {
  estado: () => Promise<Exclude<EstadoPermissao, 'indisponivel'>>;
  /** Mostra o diálogo do sistema (ou o fluxo do banco) e diz se ficou liberada. */
  pedir: () => Promise<boolean>;
}

/**
 * Quem sabe pedir cada permissão. Cada tarefa que traz o módulo nativo entra aqui: notificações na
 * T-088 (`expo-notifications`; liberada, o token vai para a API), agenda na T-085, apps de compra
 * na T-121 e banco na T-120. Sem pedido, a tela mostra "Em breve".
 */
export const PEDIDOS_DE_PERMISSAO: Partial<Record<Permissao, PedidoDePermissao>> = {
  notificacoes: { estado: estadoDaPermissaoDePush, pedir: pedirPermissaoDePush },
};

/** O estado de todas as permissões e a função que pede uma delas. */
export function usePermissoes(): {
  estados: Record<Permissao, EstadoPermissao>;
  pedir: (permissao: Permissao) => Promise<void>;
} {
  const [estados, definirEstados] = useState<Record<Permissao, EstadoPermissao>>(
    () =>
      Object.fromEntries(
        PERMISSOES.map((permissao) => [
          permissao,
          PEDIDOS_DE_PERMISSAO[permissao] ? 'nao-pedida' : 'indisponivel',
        ]),
      ) as Record<Permissao, EstadoPermissao>,
  );

  useEffect(() => {
    let ativo = true;
    for (const permissao of PERMISSOES) {
      const pedido = PEDIDOS_DE_PERMISSAO[permissao];
      if (!pedido) continue;
      void pedido.estado().then((estado) => {
        if (ativo) definirEstados((atuais) => ({ ...atuais, [permissao]: estado }));
      });
    }
    return () => {
      ativo = false;
    };
  }, []);

  async function pedir(permissao: Permissao) {
    const pedido = PEDIDOS_DE_PERMISSAO[permissao];
    if (!pedido) return;
    const liberada = await pedido.pedir();
    definirEstados((atuais) => ({ ...atuais, [permissao]: liberada ? 'liberada' : 'negada' }));
  }

  return { estados, pedir };
}
