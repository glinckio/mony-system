import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Switch, View } from 'react-native';

import { biometriaDisponivel, confirmarBiometria } from '@/lib/auth/biometria';
import { cofre } from '@/lib/auth/cofre';
import { sair } from '@/lib/auth/sessao';
import { Botao, Card, Icone, type NomeIcone, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

/** Os cadastros que já têm tela; a grade completa da aba é a T-057. */
const ATALHOS: { rota: Href; icone: NomeIcone; chave: 'categorias' | 'contas' | 'permissoes' }[] = [
  { rota: '/mais/categorias', icone: 'tag', chave: 'categorias' },
  { rota: '/mais/contas', icone: 'landmark', chave: 'contas' },
  { rota: '/mais/permissoes', icone: 'shield', chave: 'permissoes' },
];

/** Aba Mais. Por enquanto: cadastros, biometria (RN-005) e sair deste aparelho. */
export default function TelaMais() {
  const { t } = useTranslation();
  const router = useRouter();
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
    <Tela className="gap-4 p-3">
      <Texto variante="titulo-lg" accessibilityRole="header">
        {t('mais.titulo')}
      </Texto>
      <Card className="px-2 py-1">
        {ATALHOS.map(({ rota, icone, chave }, indice) => (
          <Pressable
            key={chave}
            accessibilityRole="button"
            accessibilityLabel={t(`mais.atalhos.${chave}`)}
            onPress={() => {
              router.push(rota);
            }}
            className={
              indice === 0
                ? 'min-h-toque flex-row items-center gap-3 px-2 py-3 active:opacity-70'
                : 'min-h-toque flex-row items-center gap-3 border-t border-borda px-2 py-3 active:opacity-70'
            }
          >
            <Icone nome={icone} cor={cores['texto-suave']} />
            <Texto className="flex-1">{t(`mais.atalhos.${chave}`)}</Texto>
            <Icone nome="chevron-right" tamanho={18} cor={cores['texto-suave']} />
          </Pressable>
        ))}
      </Card>
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
          icone="log-out"
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
    </Tela>
  );
}
