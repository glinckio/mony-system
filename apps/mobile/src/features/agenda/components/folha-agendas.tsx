import {
  type AgendaConectada,
  PROVEDORES_AGENDA_EXTERNA,
  type ProvedorAgendaExterna,
  type ResultadoConexaoAgenda,
} from '@mony/shared/agenda';
import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useDataCurta } from '@/lib/datas-texto';
import { mensagemDeErro } from '@/lib/formularios';
import { useFusoDoUsuario } from '@/lib/fuso';
import { Botao, Card, Chip, Erro, Folha, Skeleton, Texto } from '@/ui';

import {
  useAgendas,
  useConectarAgenda,
  useDefinirAgendaPadrao,
  useDesconectarAgenda,
} from '../hooks/use-agenda';

export interface PropsFolhaAgendas {
  visivel: boolean;
  aoFechar: () => void;
  /** A volta da conexão, para a tela dizer como foi. */
  aoConectar: (resultado: ResultadoConexaoAgenda) => void;
}

/**
 * Suas agendas (T-085e, RN-079): o Google e o Outlook, cada um conectado (quando sincronizou, a
 * padrão, [Desconectar] com confirmação) ou com [Conectar]; a que o provedor recusou pede
 * [Reconectar]. "Só no Monitorizze" deixa os novos só no app. Conectar abre o consentimento no
 * navegador do app.
 */
export function FolhaAgendas({ visivel, aoFechar, aoConectar }: PropsFolhaAgendas) {
  const { t } = useTranslation();
  const fuso = useFusoDoUsuario();
  const dataCurta = useDataCurta();
  const agendas = useAgendas();
  const conectar = useConectarAgenda();
  const padrao = useDefinirAgendaPadrao();
  const desconectar = useDesconectarAgenda();
  const [desconectando, definirDesconectando] = useState<AgendaConectada | null>(null);

  const nome = (provedor: string) => t(`agenda.fontes.${provedor as ProvedorAgendaExterna}`);
  const falha = padrao.error ?? desconectar.error;

  function fechar() {
    definirDesconectando(null);
    padrao.reset();
    desconectar.reset();
    aoFechar();
  }

  function abrirConexao(provedor: ProvedorAgendaExterna) {
    conectar.mutate(provedor, {
      onSuccess: aoConectar,
      onError: () => {
        aoConectar('erro');
      },
    });
  }

  if (desconectando !== null) {
    return (
      <Folha
        visivel={visivel}
        titulo={t('agenda.agendas.confirmarTitulo', { agenda: nome(desconectando.provedor) })}
        aoFechar={fechar}
      >
        <View className="gap-3">
          <Texto>{t('agenda.agendas.confirmarTexto')}</Texto>
          {desconectar.isError ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {mensagemDeErro(desconectar.error, t('agenda.agendas.erro'))}
            </Texto>
          ) : null}
          <Botao
            titulo={t('agenda.agendas.confirmar')}
            variante="perigo"
            larguraTotal
            carregando={desconectar.isPending}
            aoPressionar={() => {
              desconectar.mutate(desconectando.id, {
                onSuccess: () => {
                  definirDesconectando(null);
                },
              });
            }}
          />
          <Botao
            titulo={t('agenda.agendas.cancelar')}
            variante="fantasma"
            larguraTotal
            aoPressionar={() => {
              definirDesconectando(null);
              desconectar.reset();
            }}
          />
        </View>
      </Folha>
    );
  }

  function conteudo() {
    if (!agendas.data) {
      return agendas.isError ? (
        <Erro aoTentarDeNovo={() => void agendas.refetch()} />
      ) : (
        <Skeleton altura={64} />
      );
    }
    const conectadas = agendas.data.itens;
    const nenhumaPadrao = !conectadas.some((agenda) => agenda.padrao);
    return (
      <>
        {PROVEDORES_AGENDA_EXTERNA.map((provedor) => {
          const agenda = conectadas.find((item) => item.provedor === provedor);
          if (agenda === undefined) {
            return (
              <Botao
                key={provedor}
                titulo={t('agenda.agendas.conectar', { agenda: nome(provedor) })}
                variante="secundaria"
                icone="plus"
                larguraTotal
                carregando={conectar.isPending && conectar.variables === provedor}
                desabilitado={conectar.isPending}
                aoPressionar={() => {
                  abrirConexao(provedor);
                }}
              />
            );
          }
          const sincronizada =
            agenda.sincronizadaEm === null ? null : new Date(agenda.sincronizadaEm);
          return (
            <Card key={provedor} className="gap-3" testID={`agenda-${provedor}`}>
              <View className="flex-row items-center gap-2">
                <Texto className="flex-1 font-forte">{nome(provedor)}</Texto>
                {agenda.situacao === 'conectada' ? (
                  <Chip
                    rotulo={
                      agenda.padrao
                        ? t('agenda.agendas.padrao')
                        : t('agenda.agendas.usarComoPadrao')
                    }
                    selecionado={agenda.padrao}
                    desabilitado={padrao.isPending}
                    aoPressionar={() => {
                      if (!agenda.padrao) padrao.mutate(agenda.id);
                    }}
                  />
                ) : null}
              </View>
              {agenda.situacao === 'reconectar' ? (
                <>
                  <Texto variante="corpo-sm" cor="atencao">
                    {t('agenda.agendas.reconectarAviso')}
                  </Texto>
                  <Botao
                    titulo={t('agenda.agendas.reconectar')}
                    compacto
                    carregando={conectar.isPending && conectar.variables === provedor}
                    desabilitado={conectar.isPending}
                    aoPressionar={() => {
                      abrirConexao(provedor);
                    }}
                  />
                </>
              ) : (
                <Texto variante="corpo-sm" cor="suave">
                  {sincronizada === null
                    ? t('agenda.agendas.aguardando')
                    : t('agenda.agendas.sincronizada', {
                        data: dataCurta(dataNoFuso(sincronizada, fuso)),
                        hora: horaNoFuso(sincronizada, fuso),
                      })}
                </Texto>
              )}
              <Botao
                titulo={t('agenda.agendas.desconectar')}
                rotulo={t('agenda.agendas.desconectarRotulo', { agenda: nome(provedor) })}
                variante="fantasma"
                compacto
                aoPressionar={() => {
                  definirDesconectando(agenda);
                }}
              />
            </Card>
          );
        })}
        {conectadas.length > 0 ? (
          <Card className="flex-row items-center gap-3">
            <View className="flex-1 gap-1">
              <Texto className="font-forte">{t('agenda.agendas.soNoMony')}</Texto>
              <Texto variante="corpo-sm" cor="suave">
                {t('agenda.agendas.soNoMonyTexto')}
              </Texto>
            </View>
            <Chip
              rotulo={
                nenhumaPadrao ? t('agenda.agendas.padrao') : t('agenda.agendas.usarComoPadrao')
              }
              selecionado={nenhumaPadrao}
              desabilitado={padrao.isPending}
              aoPressionar={() => {
                if (!nenhumaPadrao) padrao.mutate(null);
              }}
              testID="agenda-so-no-mony"
            />
          </Card>
        ) : null}
        {falha ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(falha, t('agenda.agendas.erro'))}
          </Texto>
        ) : null}
      </>
    );
  }

  return (
    <Folha visivel={visivel} titulo={t('agenda.agendas.titulo')} aoFechar={fechar}>
      <View className="gap-3">
        <Texto cor="suave">{t('agenda.agendas.texto')}</Texto>
        {conteudo()}
      </View>
    </Folha>
  );
}
