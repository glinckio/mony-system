import {
  adiarLembretes,
  concluirLembretes,
  marcarLidaNotificacoes,
  pagarFaturas,
} from '@mony/api-client';
import { PUSH_SINCRONIZAR_ALARMES } from '@mony/shared/notificacoes';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { useSincronizarAlarmes } from '@/features/lembretes/hooks/use-alarmes-locais';
import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';
import { acaoDoPush, prepararPush, registrarTokenDePush } from '@/lib/push';

/** As consultas que um toque no push pode deixar velhas: lembretes, notificações e o Início. */
function ehDoPush(chave: readonly unknown[]): boolean {
  const [rota] = chave;
  return (
    typeof rota === 'string' &&
    (rota.startsWith('/v1/lembretes') || rota.startsWith('/v1/notificacoes'))
  );
}

/**
 * O push com a sessão aberta (doc 04, doc 09; T-088). Fica no layout das abas:
 * - **Abertura:** prepara os canais e os botões, e registra o token (`POST /me/dispositivos`), de
 *   novo quando o sistema troca o token.
 * - **Toque:** abre o `linkInterno`. [Feito] e [Adiar] mexem no lembrete; [Paguei] paga a fatura.
 *   Cada toque marca a notificação como lida. O toque que abriu o app fechado vem pela última
 *   resposta.
 * - **Push silencioso** (`sincronizar_alarmes`, T-084a): com o app aberto, busca os alarmes de novo.
 *   Com o app fechado, a próxima abertura sincroniza.
 */
export function usePushNoApp(): void {
  const { t } = useTranslation();
  const router = useRouter();
  const cliente = useQueryClient();
  const sincronizar = useSincronizarAlarmes();
  // O efeito principal roda uma vez; as funções mais novas ficam na referência.
  const atuais = useRef({ t, router, cliente, sincronizar });
  useEffect(() => {
    atuais.current = { t, router, cliente, sincronizar };
  });

  useEffect(() => {
    let ativo = true;
    const tratadas = new Set<string>();

    async function tratar(resposta: Notifications.NotificationResponse) {
      const { router: navegador, cliente: consultas, sincronizar: agenda } = atuais.current;
      const { identifier, content } = resposta.notification.request;
      const chave = `${identifier}:${resposta.actionIdentifier}`;
      if (tratadas.has(chave)) return;
      tratadas.add(chave);
      Notifications.clearLastNotificationResponse();
      const dados = content.data ?? {};
      if (typeof dados.notificacaoId === 'string') {
        void marcarLidaNotificacoes(dados.notificacaoId).catch(() => undefined);
      }
      const acao = acaoDoPush(resposta.actionIdentifier, dados);
      try {
        if (acao.tipo === 'feito') {
          await concluirLembretes(
            acao.lembreteId,
            acao.ocorrencia === null ? {} : { ocorrencia: acao.ocorrencia },
          );
        } else if (acao.tipo === 'adiar') {
          await adiarLembretes(acao.lembreteId, { opcao: '10min' });
        } else if (acao.tipo === 'paguei') {
          await pagarFaturas(acao.faturaId, {}, { headers: { 'Idempotency-Key': acao.chave } });
          void invalidarDadosFinanceiros(consultas);
        }
      } catch {
        // A tela que abre mostra o estado de verdade; a pessoa faz de novo por lá.
      }
      if (acao.tipo === 'feito' || acao.tipo === 'adiar') void agenda();
      void consultas.invalidateQueries({ predicate: ({ queryKey }) => ehDoPush(queryKey) });
      if (acao.tipo !== 'nada' && ativo) navegador.push(acao.rota);
    }

    const { t: traduzir } = atuais.current;
    void prepararPush({
      canais: {
        alertas: traduzir('notificacoes.push.canais.alertas'),
        lembretes: traduzir('notificacoes.push.canais.lembretes'),
        novidades: traduzir('notificacoes.push.canais.novidades'),
      },
      feito: traduzir('notificacoes.push.feito'),
      adiar: traduzir('notificacoes.push.adiar'),
      paguei: traduzir('notificacoes.push.paguei'),
    })
      .catch(() => undefined)
      .then(() => registrarTokenDePush());

    const respostas = Notifications.addNotificationResponseReceivedListener((resposta) => {
      void tratar(resposta);
    });
    const ultima = Notifications.getLastNotificationResponse();
    if (ultima) void tratar(ultima);
    const recebidas = Notifications.addNotificationReceivedListener((notificacao) => {
      const dados = notificacao.request.content.data ?? {};
      if (dados.tipo === PUSH_SINCRONIZAR_ALARMES) void atuais.current.sincronizar();
    });
    const tokens = Notifications.addPushTokenListener(() => {
      void registrarTokenDePush();
    });
    return () => {
      ativo = false;
      respostas.remove();
      recebidas.remove();
      tokens.remove();
    };
  }, []);
}
