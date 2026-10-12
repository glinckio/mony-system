import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BarraProgresso, Card, Icone, Logo, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

/*
 * Ilustrações das boas-vindas, montadas com os componentes do app (não são imagens), para seguirem
 * os tokens. Para o leitor de tela, cada uma é um bloco só com um rótulo: os textos de exemplo não
 * são dados do usuário.
 */

/** Primeira tela do design: "gastei 45 no mercado", a pergunta da Mony e o lançamento registrado. */
export function IlustracaoConversa() {
  const { t } = useTranslation();
  const opcoes = t('onboarding.boasVindas.ilustracao.opcoes', { returnObjects: true });
  return (
    <View
      accessible
      accessibilityLabel={t('onboarding.boasVindas.ilustracao.rotulo')}
      className="gap-3"
    >
      <View className="self-end rounded-lg bg-balao-usuario px-4 py-2">
        <Texto className="font-forte">{t('onboarding.boasVindas.ilustracao.mensagem')}</Texto>
      </View>
      <View className="flex-row items-end gap-2">
        <Logo tamanho={28} />
        <View className="gap-2 rounded-lg border border-vidro bg-vidro p-3">
          <Texto className="font-forte">{t('onboarding.boasVindas.ilustracao.pergunta')}</Texto>
          <View className="flex-row gap-2">
            {opcoes.map((opcao, indice) => (
              <View
                key={opcao}
                className={
                  indice === 0
                    ? 'rounded-total bg-claro px-3 py-1'
                    : 'rounded-total bg-vidro px-3 py-1'
                }
              >
                <Texto
                  variante="corpo-sm"
                  cor={indice === 0 ? 'inverso' : 'texto'}
                  className="font-forte"
                >
                  {opcao}
                </Texto>
              </View>
            ))}
          </View>
        </View>
      </View>
      <Card className="ml-8 gap-1">
        <Texto variante="corpo-sm" cor="receita" className="font-forte">
          {t('onboarding.boasVindas.ilustracao.registrado')}
        </Texto>
        <View className="flex-row justify-between">
          <Texto className="font-forte">{t('onboarding.boasVindas.ilustracao.descricao')}</Texto>
          <Texto className="font-forte">{t('onboarding.boasVindas.ilustracao.valor')}</Texto>
        </View>
        <Texto variante="corpo-sm" cor="suave">
          {t('onboarding.boasVindas.ilustracao.detalhes')}
        </Texto>
        <BarraProgresso percentual={62} />
        <Texto variante="legenda" cor="suave">
          {t('onboarding.boasVindas.ilustracao.orcamento')}
        </Texto>
      </Card>
    </View>
  );
}

/** Segunda tela (sem design próprio, no mesmo visual): avisos de limite e de fatura. */
export function IlustracaoAvisos() {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityLabel={t('onboarding.avisos.ilustracao.rotulo')}
      className="gap-3"
    >
      <Card className="gap-2">
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-total bg-atencao-suave">
            <Icone nome="bell" cor={cores.atencao} />
          </View>
          <View className="flex-1">
            <Texto className="font-forte">{t('onboarding.avisos.ilustracao.cartao')}</Texto>
            <Texto variante="corpo-sm" cor="suave">
              {t('onboarding.avisos.ilustracao.cartaoDetalhe')}
            </Texto>
          </View>
        </View>
        <BarraProgresso percentual={80} />
      </Card>
      <Card className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-total bg-primaria-suave">
          <Icone nome="calendar" cor={cores.link} />
        </View>
        <View className="flex-1">
          <Texto className="font-forte">{t('onboarding.avisos.ilustracao.fatura')}</Texto>
          <Texto variante="corpo-sm" cor="suave">
            {t('onboarding.avisos.ilustracao.faturaDetalhe')}
          </Texto>
        </View>
      </Card>
    </View>
  );
}
