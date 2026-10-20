import { alarmesLembretes } from '@mony/api-client';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import i18n from '@/i18n';
import { alarmes, type TextosAlarme } from '@/lib/alarmes';

/** Os textos do alarme no aparelho, do i18n (também sem a tela, na tarefa do push, T-088b). */
export function textosDoAlarme(): TextosAlarme {
  return {
    canal: i18n.t('alarmes.nativo.canal'),
    parar: i18n.t('alarmes.nativo.parar'),
    adiar: i18n.t('alarmes.nativo.adiar'),
  };
}

/**
 * Doc 09: a agenda de alarmes do aparelho (`mony-alarm`) segue o servidor. Busca os próximos
 * alarmes (`GET /lembretes/alarmes`) e troca a agenda inteira; os adiados no próprio alarme ficam.
 * Sem o módulo (iOS até a T-023b, testes), não faz nada. `false` sem conexão: fica a agenda de
 * antes. A tarefa do push com o app fechado passa o token de segundo plano em `opcoes` (T-088b).
 */
export async function sincronizarAlarmesDoServidor(
  textos: TextosAlarme,
  opcoes?: RequestInit,
): Promise<boolean> {
  const modulo = alarmes;
  if (!modulo) return false;
  const { alarmes: lista } = await alarmesLembretes(opcoes);
  await modulo.sincronizar(
    lista.map(({ id, instante, titulo, corpo }) => ({
      id,
      instante: Date.parse(instante),
      titulo,
      corpo,
    })),
    textos,
  );
  return true;
}

/** A sincronização com a sessão do app aberta; um erro deixa a agenda de antes. */
export function useSincronizarAlarmes(): () => Promise<void> {
  return useCallback(async () => {
    try {
      await sincronizarAlarmesDoServidor(textosDoAlarme());
    } catch {
      // Fica a agenda de antes; a próxima abertura do app tenta de novo.
    }
  }, []);
}

/**
 * Sincroniza os alarmes ao abrir o app e ao voltar para ele (doc 09). Fica no layout das abas, que
 * só existe com a sessão aberta. O push silencioso da API (T-084a) é tratado na T-088.
 */
export function useAlarmesAoAbrir(): void {
  const sincronizar = useSincronizarAlarmes();
  useEffect(() => {
    if (!alarmes) return undefined;
    void sincronizar();
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizar();
    });
    return () => {
      assinatura.remove();
    };
  }, [sincronizar]);
}

/** As permissões que faltam para o alarme tocar na hora e em tela cheia (Android). */
export async function permissoesQueFaltam(): Promise<('alarmeExato' | 'telaCheia')[]> {
  const modulo = alarmes;
  if (!modulo) return [];
  try {
    const permissoes = await modulo.permissoes();
    return (['alarmeExato', 'telaCheia'] as const).filter((chave) => !permissoes[chave]);
  } catch {
    return [];
  }
}
