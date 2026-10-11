import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import { confirmarBiometria } from '@/lib/auth/biometria';
import { desbloquearSessao, sair } from '@/lib/auth/sessao';
import { Botao, Texto } from '@/ui';

/**
 * Abertura com a biometria ligada (RN-005): só ela libera o token de renovação guardado. Quem
 * desiste entra de novo com e-mail e senha (a sessão do aparelho é encerrada).
 */
async function tentarDesbloquear(motivo: string, cancelar: string): Promise<void> {
  if (await confirmarBiometria(motivo, cancelar)) await desbloquearSessao();
}

export default function TelaBloqueio() {
  const { t } = useTranslation();
  const motivo = t('auth.bloqueio.motivo');
  const cancelar = t('auth.bloqueio.cancelar');
  // Abre já pedindo a biometria.
  const [ocupada, definirOcupada] = useState(true);
  const pediuAoAbrir = useRef(false);

  useEffect(() => {
    // Pede a biometria uma vez, ao abrir; depois, só pelo botão.
    if (pediuAoAbrir.current) return;
    pediuAoAbrir.current = true;
    void tentarDesbloquear(motivo, cancelar).finally(() => {
      definirOcupada(false);
    });
  }, [motivo, cancelar]);

  function desbloquear() {
    definirOcupada(true);
    void tentarDesbloquear(motivo, cancelar).finally(() => {
      definirOcupada(false);
    });
  }

  return (
    <SafeAreaView className="flex-1 justify-center gap-4 bg-fundo p-6">
      <Texto variante="titulo-lg" accessibilityRole="header">
        {t('auth.bloqueio.titulo')}
      </Texto>
      <Texto cor="suave">{t('auth.bloqueio.explicacao')}</Texto>
      <Botao
        titulo={t('auth.bloqueio.desbloquear')}
        icone="finger-print"
        aoPressionar={desbloquear}
        carregando={ocupada}
        larguraTotal
      />
      <Botao
        variante="fantasma"
        titulo={t('auth.bloqueio.entrarDeNovo')}
        aoPressionar={() => void sair()}
      />
    </SafeAreaView>
  );
}
