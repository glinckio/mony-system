import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BotaoIcone, Icone, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { useAtualizarOnboarding, useOnboarding } from '../hooks/use-onboarding';
import { etapaPendente } from '../lib/etapas';

/** As dicas que existem; texto em `onboarding.dica.textos`. Chave nova entra nos dois lugares. */
export type ChaveDica = 'transacoes.selecao' | 'mony.primeira-conversa';

interface PropsDica {
  chave: ChaveDica;
}

/**
 * Dica contextual da primeira visita a uma tela (doc 04, "Onboarding"). Fechada uma vez, não volta,
 * nem depois de reinstalar: fica em `dicasVistas` no servidor. Fechar a primeira dica conclui o
 * passo "Conhecer o app" do checklist. Enquanto o progresso não chega da API, nada aparece.
 */
export function Dica({ chave }: PropsDica) {
  const { t } = useTranslation();
  const onboarding = useOnboarding();
  const atualizar = useAtualizarOnboarding();
  const dados = onboarding.data;
  if (!dados || dados.dicasVistas.includes(chave)) return null;

  return (
    <View
      className="flex-row items-center gap-3 rounded-md border border-vidro bg-vidro py-2 pl-3 pr-1"
      accessibilityRole="summary"
      testID={`dica-${chave}`}
    >
      <Icone nome="lightbulb" cor={cores.atencao} />
      <Texto variante="corpo-sm" className="flex-1">
        {t(`onboarding.dica.textos.${chave}`)}
      </Texto>
      <BotaoIcone
        icone="x"
        rotulo={t('onboarding.dica.entendi')}
        aoPressionar={() => {
          atualizar.mutate({
            dicasVistas: [chave],
            ...(etapaPendente(dados, 'tour') ? { etapas: { tour: 'concluida' as const } } : {}),
          });
        }}
      />
    </View>
  );
}
