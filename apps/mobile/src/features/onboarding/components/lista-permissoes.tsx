import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import { type EstadoPermissao, type Permissao, PERMISSOES, usePermissoes } from '@/lib/permissoes';
import { Botao, Card, Etiqueta, Icone, type NomeIcone, Texto } from '@/ui';
import { type Cor, cores } from '@/ui/tokens';

const VISUAL: Record<Permissao, { icone: NomeIcone; cor: Cor; fundo: string }> = {
  notificacoes: { icone: 'bell', cor: 'link', fundo: 'bg-primaria-suave' },
  agenda: { icone: 'calendar', cor: 'ciano', fundo: 'bg-vidro' },
  'apps-de-compra': { icone: 'shopping-bag', cor: 'atencao', fundo: 'bg-atencao-suave' },
  banco: { icone: 'landmark', cor: 'texto-suave', fundo: 'bg-vidro' },
};

function Acao({
  permissao,
  estado,
  titulo,
  aoPedir,
}: {
  permissao: Permissao;
  estado: EstadoPermissao;
  titulo: string;
  aoPedir: () => void;
}) {
  const { t } = useTranslation();
  if (estado === 'indisponivel') {
    return <Etiqueta texto={t('onboarding.permissoes.emBreve')} />;
  }
  if (permissao === 'banco') {
    return estado === 'liberada' ? (
      <Icone nome="circle-check" cor={cores.receita} />
    ) : (
      <Botao
        variante="secundaria"
        titulo={t('onboarding.permissoes.conectar')}
        aoPressionar={aoPedir}
      />
    );
  }
  return (
    <Switch
      accessibilityLabel={titulo}
      value={estado === 'liberada'}
      // Liberada não se desliga por aqui: só nas configurações do aparelho.
      disabled={estado === 'liberada'}
      onValueChange={(ligar) => {
        if (ligar) aoPedir();
      }}
      trackColor={{ true: cores.primaria, false: cores.borda }}
    />
  );
}

/**
 * As permissões do onboarding (design, página 2) e da tela de Permissões: cada uma pede o diálogo
 * do sistema só quando a pessoa liga. Recusada, a tela explica onde liberar.
 */
export function ListaPermissoes() {
  const { t } = useTranslation();
  const { estados, pedir } = usePermissoes();
  return (
    <View className="gap-3">
      {PERMISSOES.map((permissao) => {
        const { icone, cor, fundo } = VISUAL[permissao];
        const titulo = t(`onboarding.permissoes.itens.${permissao}.titulo`);
        const estado = estados[permissao];
        return (
          <Card
            key={permissao}
            className="flex-row items-center gap-3"
            testID={`permissao-${permissao}`}
          >
            <View className={`h-12 w-12 items-center justify-center rounded-total ${fundo}`}>
              <Icone nome={icone} cor={cores[cor]} />
            </View>
            <View className="flex-1 gap-0.5">
              <Texto className="font-forte">{titulo}</Texto>
              <Texto variante="corpo-sm" cor="suave">
                {estado === 'negada'
                  ? t('onboarding.permissoes.negada')
                  : t(`onboarding.permissoes.itens.${permissao}.texto`)}
              </Texto>
            </View>
            <Acao
              permissao={permissao}
              estado={estado}
              titulo={titulo}
              aoPedir={() => void pedir(permissao)}
            />
          </Card>
        );
      })}
    </View>
  );
}
