import { alarmesLembretes } from '@mony/api-client';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { alarmes } from '@/lib/alarmes';

/**
 * Doc 09: a agenda de alarmes do aparelho (`mony-alarm`) segue o servidor. Busca os próximos
 * alarmes (`GET /lembretes/alarmes`) e troca a agenda inteira; os adiados no próprio alarme ficam.
 * Sem o módulo (iOS até a T-023b, testes), não faz nada. Sem conexão, fica a agenda de antes.
 */
export function useSincronizarAlarmes(): () => Promise<void> {
  const { t } = useTranslation();
  return useCallback(async () => {
    const modulo = alarmes;
    if (!modulo) return;
    try {
      const { alarmes: lista } = await alarmesLembretes();
      await modulo.sincronizar(
        lista.map(({ id, instante, titulo, corpo }) => ({
          id,
          instante: Date.parse(instante),
          titulo,
          corpo,
        })),
        {
          canal: t('alarmes.nativo.canal'),
          parar: t('alarmes.nativo.parar'),
          adiar: t('alarmes.nativo.adiar'),
        },
      );
    } catch {
      // Fica a agenda de antes; a próxima abertura do app tenta de novo.
    }
  }, [t]);
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
