import type { RecursoComConvite } from '@mony/shared/compartilhamentos';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { Avatar, Botao, Card, Texto } from '@/ui';

import { useCompartilhamentos, useResponderConvite } from '../hooks/use-compartilhamentos';
import { convitesPendentes } from '../lib/compartilhamentos';

/**
 * Os convites que esperam resposta (RN-074), no topo das listas ou dos lembretes: quem chamou e
 * para o quê, com [Aceitar] e [Recusar]. Sem convite, não mostra nada.
 */
export function ConvitesRecebidos({ recurso }: { recurso: RecursoComConvite }) {
  const { t } = useTranslation();
  const consulta = useCompartilhamentos();
  const responder = useResponderConvite();
  const pendentes = convitesPendentes(consulta.data, recurso);
  if (pendentes.length === 0) return null;
  const respondendo = responder.isPending ? responder.variables.id : null;
  return (
    <Card className="gap-3" testID="convites-recebidos">
      <Texto variante="corpo-sm" cor="suave" className="font-forte" accessibilityRole="header">
        {t('compartilhamentos.convites.titulo')}
      </Texto>
      {pendentes.map((convite, indice) => (
        <View
          key={convite.id}
          className={indice > 0 ? 'gap-3 border-t border-borda pt-3' : 'gap-3'}
          testID={`convite-${convite.id}`}
        >
          <View className="flex-row items-center gap-3">
            <Avatar nome={convite.dono.nome} tamanho={32} />
            <Texto className="flex-1">
              {t(`compartilhamentos.convites.${recurso}`, {
                nome: convite.dono.nome,
                recurso: convite.recursoNome,
              })}
            </Texto>
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Botao
                titulo={t('compartilhamentos.convites.aceitar')}
                compacto
                larguraTotal
                carregando={respondendo === convite.id && responder.variables?.aceitar === true}
                desabilitado={respondendo !== null}
                aoPressionar={() => {
                  responder.mutate({ id: convite.id, aceitar: true });
                }}
              />
            </View>
            <View className="flex-1">
              <Botao
                variante="secundaria"
                titulo={t('compartilhamentos.convites.recusar')}
                compacto
                larguraTotal
                carregando={respondendo === convite.id && responder.variables?.aceitar === false}
                desabilitado={respondendo !== null}
                aoPressionar={() => {
                  responder.mutate({ id: convite.id, aceitar: false });
                }}
              />
            </View>
          </View>
        </View>
      ))}
      {responder.isError ? (
        <Texto variante="corpo-sm" cor="perigo" accessibilityRole="alert">
          {mensagemDeErro(responder.error, t('compartilhamentos.semConexao'))}
        </Texto>
      ) : null}
    </Card>
  );
}
