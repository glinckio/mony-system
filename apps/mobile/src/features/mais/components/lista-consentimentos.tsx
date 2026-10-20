import type { Consentimento } from '@mony/shared/consentimentos';
import { dataNoFuso } from '@mony/shared/datas';
import type { FinalidadeConsentimento } from '@mony/shared/enums';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDataCurta } from '@/lib/datas-texto';
import { mensagemDeErro } from '@/lib/formularios';
import { useFusoDoUsuario } from '@/lib/fuso';
import { Botao, Card, Erro, Folha, Skeleton, Texto } from '@/ui';

import { useConsentimentos, useRevogarConsentimento } from '../hooks/use-consentimentos';

/** O Open Finance só aparece depois de existir (T-120); os outros, sempre. */
const visivel = ({ finalidade, concedidoEm }: Consentimento) =>
  finalidade !== 'open_finance' || concedidoEm !== null;

/**
 * Os consentimentos (LGPD, doc 11, T-140e): o que a pessoa autorizou, desde quando, e [Revogar],
 * que confirma numa folha dizendo o que desliga (`DELETE /consentimentos/:finalidade`). Ligar de
 * novo é pelo próprio recurso (conectar a agenda, ligar os apps de compra, pôr a ligação num
 * lembrete).
 */
export function ListaConsentimentos() {
  const { t } = useTranslation();
  const fuso = useFusoDoUsuario();
  const dataCurta = useDataCurta();
  const consulta = useConsentimentos();
  const revogar = useRevogarConsentimento();
  const [escolhida, definirEscolhida] = useState<FinalidadeConsentimento | null>(null);

  const data = (instante: string) => dataCurta(dataNoFuso(new Date(instante), fuso));

  function fechar() {
    definirEscolhida(null);
    revogar.reset();
  }

  return (
    <View className="gap-3">
      <Texto variante="titulo" accessibilityRole="header">
        {t('mais.consentimentos.titulo')}
      </Texto>
      <Texto cor="suave">{t('mais.consentimentos.texto')}</Texto>
      {consulta.data ? (
        consulta.data.itens.filter(visivel).map((consentimento) => (
          <Card key={consentimento.finalidade} className="flex-row items-center gap-3">
            <View className="flex-1 gap-1">
              <Texto className="font-forte">
                {t(`mais.consentimentos.finalidades.${consentimento.finalidade}`)}
              </Texto>
              <Texto variante="corpo-sm" cor="suave">
                {consentimento.concedido && consentimento.concedidoEm !== null
                  ? t('mais.consentimentos.desde', { data: data(consentimento.concedidoEm) })
                  : consentimento.revogadoEm !== null
                    ? t('mais.consentimentos.revogadoEm', { data: data(consentimento.revogadoEm) })
                    : t('mais.consentimentos.nunca')}
              </Texto>
            </View>
            {consentimento.concedido ? (
              <Botao
                titulo={t('mais.consentimentos.revogar')}
                variante="secundaria"
                compacto
                rotulo={t('mais.consentimentos.revogarRotulo', {
                  nome: t(`mais.consentimentos.finalidades.${consentimento.finalidade}`),
                })}
                aoPressionar={() => {
                  definirEscolhida(consentimento.finalidade);
                }}
              />
            ) : null}
          </Card>
        ))
      ) : consulta.isError ? (
        <Erro aoTentarDeNovo={() => void consulta.refetch()} />
      ) : (
        <Skeleton altura={64} />
      )}

      <Folha
        visivel={escolhida !== null}
        titulo={
          escolhida === null
            ? ''
            : t('mais.consentimentos.confirmarTitulo', {
                nome: t(`mais.consentimentos.finalidades.${escolhida}`),
              })
        }
        aoFechar={fechar}
      >
        <View className="gap-3">
          {escolhida === null ? null : (
            <Texto>{t(`mais.consentimentos.efeitos.${escolhida}`)}</Texto>
          )}
          {revogar.isError ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {mensagemDeErro(revogar.error, t('mais.semConexao'))}
            </Texto>
          ) : null}
          <Botao
            titulo={t('mais.consentimentos.confirmar')}
            variante="perigo"
            larguraTotal
            carregando={revogar.isPending}
            aoPressionar={() => {
              if (escolhida === null) return;
              revogar.mutate(escolhida, { onSuccess: fechar });
            }}
          />
          <Botao
            titulo={t('mais.consentimentos.cancelar')}
            variante="fantasma"
            larguraTotal
            aoPressionar={fechar}
          />
        </View>
      </Folha>
    </View>
  );
}
