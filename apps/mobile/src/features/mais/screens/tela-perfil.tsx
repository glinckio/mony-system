import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch, View } from 'react-native';

import { usePlano } from '@/features/planos/hooks/use-plano';
import { biometriaDisponivel, confirmarBiometria } from '@/lib/auth/biometria';
import { cofre } from '@/lib/auth/cofre';
import { sair } from '@/lib/auth/sessao';
import { useSessao } from '@/stores/sessao';
import { Avatar, Cabecalho, Card, Etiqueta, Icone, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { Linha } from '../components/linha';
import { usePerfil } from '../hooks/use-perfil';

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Texto variante="legenda" cor="suave" className="font-forte" accessibilityRole="header">
        {titulo.toUpperCase()}
      </Texto>
      <Card className="py-1">{children}</Card>
    </View>
  );
}

/**
 * Perfil e configurações (design, página 9): dados pessoais, seu plano (T-100), biometria (RN-005),
 * alertas da Mony (T-087), permissões, rever o tutorial e sair. A compra dos planos (T-103),
 * exportar e excluir conta (T-140) entram com as tarefas deles; o modo escuro não existe (o app é
 * só escuro, T-017).
 */
export default function TelaPerfil() {
  const { t } = useTranslation();
  const router = useRouter();
  const nome = useSessao((estado) => estado.usuario?.nome ?? '');
  const perfil = usePerfil();
  // O selo "Teste grátis" na linha do plano (T-101).
  const emTeste = usePlano().data?.plano === 'teste';
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
    if (
      ligar &&
      !(await confirmarBiometria(
        t('mais.perfilTela.biometriaMotivo'),
        t('mais.perfilTela.cancelar'),
      ))
    ) {
      return;
    }
    await cofre.ligarBiometria(ligar);
    definirLigada(ligar);
  }

  return (
    <Tela className="px-4 pt-2">
      <Cabecalho
        titulo={t('mais.perfilTela.titulo')}
        aoVoltar={() => {
          router.dismissTo('/mais');
        }}
      />
      <ScrollView contentContainerClassName="gap-4 pb-8 pt-2">
        <View className="items-center gap-1">
          <Avatar nome={nome} tamanho={64} />
          <Texto variante="titulo">{nome}</Texto>
          {perfil.data ? (
            <Texto variante="corpo-sm" cor="suave">
              {perfil.data.email}
            </Texto>
          ) : null}
        </View>

        <Secao titulo={t('mais.perfilTela.conta')}>
          <Linha
            primeira
            titulo={t('mais.perfilTela.dadosPessoais')}
            aoPressionar={() => {
              router.push('/mais/dados-pessoais');
            }}
          />
          <Linha
            titulo={t('mais.perfilTela.plano')}
            ajuda={t('mais.perfilTela.planoAjuda')}
            direita={
              emTeste ? (
                <View className="flex-row items-center gap-2">
                  <Etiqueta texto={t('planos.nomes.teste')} tom="primaria" />
                  <Icone nome="chevron-right" tamanho={18} cor={cores['texto-suave']} />
                </View>
              ) : undefined
            }
            aoPressionar={() => {
              router.push('/mais/plano');
            }}
          />
          {disponivel ? (
            <Linha
              titulo={t('mais.perfilTela.biometria')}
              ajuda={t('mais.perfilTela.biometriaAjuda')}
              direita={
                <Switch
                  accessibilityLabel={t('mais.perfilTela.biometria')}
                  value={ligada}
                  onValueChange={(valor) => void mudarBiometria(valor)}
                  trackColor={{ true: cores.primaria, false: cores.borda }}
                />
              }
            />
          ) : null}
        </Secao>

        <Secao titulo={t('mais.perfilTela.preferencias')}>
          <Linha
            primeira
            titulo={t('mais.perfilTela.alertas')}
            ajuda={t('mais.perfilTela.alertasAjuda')}
            aoPressionar={() => {
              router.push('/mais/alertas');
            }}
          />
          <Linha
            titulo={t('mais.perfilTela.permissoes')}
            aoPressionar={() => {
              router.push('/mais/permissoes');
            }}
          />
          <Linha
            titulo={t('mais.perfilTela.tutorial')}
            aoPressionar={() => {
              router.push('/tutorial');
            }}
          />
        </Secao>

        <Secao titulo={t('mais.perfilTela.privacidade')}>
          <Linha
            primeira
            titulo={t('mais.perfilTela.sair')}
            ajuda={t('mais.perfilTela.sairAjuda')}
            aoPressionar={
              saindo
                ? undefined
                : () => {
                    definirSaindo(true);
                    void sair().finally(() => {
                      definirSaindo(false);
                    });
                  }
            }
          />
        </Secao>
      </ScrollView>
    </Tela>
  );
}
