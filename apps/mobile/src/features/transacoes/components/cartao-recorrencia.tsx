import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { Botao, Card, Folha, Icone, Skeleton, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import { useExcluirRecorrencia, useRecorrencia } from '../hooks/use-recorrencias';
import { dataParaTexto } from '../lib/periodo';

interface PropsCartaoRecorrencia {
  recorrenciaId: string;
  /** Depois de parar: o formulário volta para a lista. */
  aoParar: () => void;
}

/**
 * Na ocorrência de uma recorrência (RN-043): como ela repete, "Editar recorrência" e "Parar
 * recorrência" (`DELETE /recorrencias/:id`, com confirmação).
 */
export function CartaoRecorrencia({ recorrenciaId, aoParar }: PropsCartaoRecorrencia) {
  const { t } = useTranslation();
  const router = useRouter();
  const consulta = useRecorrencia(recorrenciaId);
  const parar = useExcluirRecorrencia();
  const [confirmando, definirConfirmando] = useState(false);
  const recorrencia = consulta.data;

  if (recorrencia === undefined) {
    return consulta.isPending ? <Skeleton altura={96} /> : null;
  }

  return (
    <Card className="gap-3" testID="cartao-recorrencia">
      <View className="flex-row items-center gap-2">
        <Icone nome="repeat" tamanho={18} cor={cores['texto-suave']} />
        <Texto className="flex-1 font-forte">
          {t('transacoes.recorrencia.repete', {
            frequencia: t(`transacoes.frequencia.${recorrencia.frequencia}`),
          })}
          {' · '}
          {recorrencia.dataFim === null
            ? t('transacoes.recorrencia.semFim')
            : t('transacoes.recorrencia.ate', { data: dataParaTexto(recorrencia.dataFim) })}
        </Texto>
      </View>
      {recorrencia.ativa ? (
        <View className="flex-row flex-wrap gap-2">
          <Botao
            variante="secundaria"
            compacto
            icone="pencil"
            titulo={t('transacoes.recorrencia.editar')}
            aoPressionar={() => {
              router.push({ pathname: '/recorrencias/[id]', params: { id: recorrencia.id } });
            }}
          />
          <Botao
            variante="perigo"
            compacto
            titulo={t('transacoes.recorrencia.parar')}
            aoPressionar={() => {
              parar.reset();
              definirConfirmando(true);
            }}
          />
        </View>
      ) : (
        <Texto variante="corpo-sm" cor="suave">
          {t('transacoes.recorrencia.parada')}
        </Texto>
      )}

      <Folha
        visivel={confirmando}
        titulo={t('transacoes.recorrencia.pararTitulo')}
        aoFechar={() => {
          definirConfirmando(false);
        }}
        rodape={
          <>
            <Botao
              variante="perigo"
              larguraTotal
              titulo={t('transacoes.recorrencia.pararSim')}
              carregando={parar.isPending}
              aoPressionar={() => {
                parar.mutate(recorrencia.id, {
                  onSuccess: () => {
                    definirConfirmando(false);
                    aoParar();
                  },
                });
              }}
            />
            <Botao
              variante="fantasma"
              titulo={t('transacoes.recorrencia.cancelar')}
              aoPressionar={() => {
                definirConfirmando(false);
              }}
            />
          </>
        }
      >
        <Texto cor="suave">{t('transacoes.recorrencia.pararTexto')}</Texto>
        {parar.isError ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(parar.error, t('transacoes.semConexao'))}
          </Texto>
        ) : null}
      </Folha>
    </Card>
  );
}
