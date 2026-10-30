import {
  adiarLembretes,
  concluirLembretes,
  ErroApi,
  marcarLidaNotificacoes,
  pagarFaturas,
} from '@mony/api-client';
import { PUSH_SINCRONIZAR_ALARMES } from '@mony/shared/notificacoes';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useSincronizarAlarmes } from '@/features/lembretes/hooks/use-alarmes-locais';
import { invalidarDadosFinanceiros } from '@/lib/api/invalidar';
import {
  acaoDoPush,
  estadoDaPermissaoDePush,
  prepararPush,
  registrarTokenDePush,
} from '@/lib/push';
import { chaveDoToque, reservarToque } from '@/lib/toques-push';

import { renovarTokenSegundoPlano } from '../push-segundo-plano';

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
 * - **Abertura:** prepara os canais e os botões, registra o token (`POST /me/dispositivos`), de
 *   novo quando o sistema troca o token, e pede o token de segundo plano para a tarefa do push com
 *   o app fechado (T-088b). Os dois só com a permissão liberada.
 * - **Toque:** abre o `linkInterno`. [Feito] e [Adiar] mexem no lembrete; [Paguei] paga a fatura.
 *   Cada toque marca a notificação como lida. Sem permissão (403), mostra a mensagem da API. O
 *   toque que abriu o app fechado vem pela última resposta. O toque que a tarefa de segundo plano
 *   já tratou (Android, T-088b) não faz nada aqui.
 * - **Push silencioso** (`sincronizar_alarmes`, T-084a): com o app aberto, busca os alarmes de novo.
 *   Com o app fechado, quem busca é a tarefa de segundo plano (`push-segundo-plano.ts`, T-088b).
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

    async function tratar(resposta: Notifications.NotificationResponse) {
      const { router: navegador, cliente: consultas, sincronizar: agenda } = atuais.current;
      const { identifier, content } = resposta.notification.request;
      Notifications.clearLastNotificationResponse();
      if (!(await reservarToque(chaveDoToque(identifier, resposta.actionIdentifier)))) return;
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
      } catch (erro) {
        // A tela que abre mostra o estado de verdade; a pessoa faz de novo por lá. O 403 (lembrete
        // recebido com `ver`, RN-074) diz por que o botão não fez nada.
        if (erro instanceof ErroApi && erro.status === 403) Alert.alert(erro.message);
      }
      if (acao.tipo === 'feito' || acao.tipo === 'adiar') {
        // No Android o botão não abre o app nem tira a notificação da barra (T-088b).
        void Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
        void agenda();
      }
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
      .then(async () => {
        // O token de segundo plano só serve quando o push pode chegar: com a permissão liberada,
        // que é também quando o aparelho fica registrado para receber push.
        if ((await estadoDaPermissaoDePush()) !== 'liberada') return;
        await Promise.all([registrarTokenDePush(), renovarTokenSegundoPlano()]);
      });

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
