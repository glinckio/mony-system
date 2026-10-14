import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

import { alarmes } from '@/lib/alarmes';
import { Botao, Folha, Texto } from '@/ui';

import { permissoesQueFaltam } from '../hooks/use-alarmes-locais';

/** Guarda no aparelho que as permissões do alarme já foram pedidas uma vez. */
const CHAVE_PEDIDO = 'mony-alarme-permissoes-pedidas';

/**
 * Doc 04 e T-023a: no primeiro lembrete com alarme, as liberações que faltam no Android (o alarme
 * exato e a tela cheia). Pede uma vez só; a tela de Permissões mostra o estado depois.
 */
export async function permissoesParaPedir(): Promise<('alarmeExato' | 'telaCheia')[]> {
  if (!alarmes) return [];
  try {
    if ((await AsyncStorage.getItem(CHAVE_PEDIDO)) !== null) return [];
    const faltam = await permissoesQueFaltam();
    if (faltam.length > 0) await AsyncStorage.setItem(CHAVE_PEDIDO, '1');
    return faltam;
  } catch {
    return [];
  }
}

export interface PropsFolhaPermissoesAlarme {
  faltam: readonly ('alarmeExato' | 'telaCheia')[];
  aoFechar: () => void;
}

/** A folha que explica e leva às configurações do sistema. */
export function FolhaPermissoesAlarme({ faltam, aoFechar }: PropsFolhaPermissoesAlarme) {
  const { t } = useTranslation();
  const abrir = {
    alarmeExato: () => alarmes?.abrirConfiguracaoAlarmeExato(),
    telaCheia: () => alarmes?.abrirConfiguracaoTelaCheia(),
  };
  return (
    <Folha
      visivel={faltam.length > 0}
      titulo={t('lembretes.permissoes.titulo')}
      aoFechar={aoFechar}
      testID="folha-permissoes-alarme"
      rodape={
        <Botao
          variante="fantasma"
          titulo={t('lembretes.permissoes.depois')}
          aoPressionar={aoFechar}
        />
      }
    >
      <Texto cor="suave">{t('lembretes.permissoes.texto')}</Texto>
      {faltam.map((permissao) => (
        <Botao
          key={permissao}
          variante="secundaria"
          titulo={t(`lembretes.permissoes.${permissao}`)}
          larguraTotal
          aoPressionar={() => {
            void abrir[permissao]();
          }}
        />
      ))}
    </Folha>
  );
}
