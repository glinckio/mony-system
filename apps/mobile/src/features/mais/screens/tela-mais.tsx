import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { biometriaDisponivel, confirmarBiometria } from '@/lib/auth/biometria';
import { cofre } from '@/lib/auth/cofre';
import { sair } from '@/lib/auth/sessao';
import { Botao, Card, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

/** Aba Mais. Por enquanto: biometria (RN-005) e sair deste aparelho. */
export default function TelaMais() {
  const { t } = useTranslation();
  const [disponivel, definirDisponivel] = useState(false);
  const [ligada, definirLigada] = useState(false);
  const [saindo, definirSaindo] = useState(false);

  useEffect(() => {
    void (async () => {
      const [temBiometria, estaLigada] = await Promise.all([
        biometriaDisponivel(),
        cofre.biometriaLigada(),
      ]);
      definirDisponivel(temBiometria);
      definirLigada(estaLigada);
    })();
  }, []);

  async function mudarBiometria(ligar: boolean) {
    // Ligar pede a biometria uma vez, para confirmar que é a pessoa e que o sensor funciona.
    if (ligar && !(await confirmarBiometria(t('mais.biometriaMotivo'), t('mais.cancelar')))) return;
    await cofre.ligarBiometria(ligar);
    definirLigada(ligar);
  }

  return (
    <SafeAreaView className="flex-1 gap-4 bg-fundo p-4" edges={['top']}>
      <Texto variante="titulo-lg" accessibilityRole="header">
        {t('mais.titulo')}
      </Texto>
      <Card className="gap-3">
        <Texto variante="corpo-sm" cor="suave" className="font-forte">
          {t('mais.seguranca')}
        </Texto>
        {disponivel ? (
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Texto>{t('mais.biometria')}</Texto>
              <Texto variante="legenda" cor="suave">
                {t('mais.biometriaAjuda')}
              </Texto>
            </View>
            <Switch
              accessibilityLabel={t('mais.biometria')}
              value={ligada}
              onValueChange={(valor) => void mudarBiometria(valor)}
              trackColor={{ true: cores.primaria, false: cores.borda }}
            />
          </View>
        ) : null}
        <Botao
          variante="secundaria"
          icone="log-out-outline"
          titulo={t('mais.sair')}
          carregando={saindo}
          aoPressionar={() => {
            definirSaindo(true);
            void sair().finally(() => {
              definirSaindo(false);
            });
          }}
        />
      </Card>
    </SafeAreaView>
  );
}
