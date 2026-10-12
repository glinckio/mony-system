import { ErroApi } from '@mony/api-client';
import { formatarCentavos } from '@mony/shared/dinheiro';
import type { Aporte } from '@mony/shared/metas';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { dataParaTexto } from '@/features/transacoes/lib/periodo';
import { mensagemDeErro } from '@/lib/formularios';
import {
  BarraProgresso,
  Botao,
  BotaoIcone,
  Cabecalho,
  Card,
  Erro,
  Etiqueta,
  Folha,
  Skeleton,
  Tela,
  Texto,
  useTextoDoValor,
  Valor,
} from '@/ui';

import { tomDaMeta, usePrazoDaMeta } from '../components/cartao-meta';
import { FolhaAporte } from '../components/folha-aporte';
import { useAtualizarMeta, useExcluirAporte, useMeta } from '../hooks/use-metas';

/**
 * A meta (`/metas/<id>`): quanto já foi guardado, quanto falta, o prazo e os aportes. Daqui se
 * guarda, tira um aporte, conclui ou reabre a meta (RN-063) e vai para a edição.
 */
export default function TelaMeta() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const consulta = useMeta(id);
  const atualizar = useAtualizarMeta();
  const excluirAporte = useExcluirAporte();
  const textoDoValor = useTextoDoValor();
  const prazoDaMeta = usePrazoDaMeta();
  const [guardando, definirGuardando] = useState(false);
  const [tirando, definirTirando] = useState<Aporte | null>(null);
  const meta = consulta.data;

  function voltar() {
    router.dismissTo('/metas');
  }

  if (meta === undefined) {
    const naoEncontrada = consulta.error instanceof ErroApi && consulta.error.status === 404;
    return (
      <Tela className="gap-4 px-4 pt-2">
        <Cabecalho titulo={t('metas.titulo')} aoVoltar={voltar} />
        {consulta.isPending ? (
          <View className="gap-4">
            <Skeleton altura={160} />
            <Skeleton altura={120} />
          </View>
        ) : (
          <Erro
            mensagem={naoEncontrada ? t('metas.detalhe.naoEncontrada') : undefined}
            aoTentarDeNovo={naoEncontrada ? undefined : () => void consulta.refetch()}
          />
        )}
      </Tela>
    );
  }

  const tom = tomDaMeta(0);
  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={meta.titulo}
        aoVoltar={voltar}
        acao={
          <BotaoIcone
            icone="pencil"
            comFundo
            rotulo={t('metas.editar')}
            aoPressionar={() => {
              router.push({ pathname: '/metas/[id]/editar', params: { id: meta.id } });
            }}
          />
        }
      />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-6">
        <Card className="gap-3">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1 gap-1">
              <Valor centavos={meta.valorAtualCentavos} variante="titulo-lg" testID="meta-atual" />
              <Texto variante="corpo-sm" cor="suave">
                {t('metas.valores', {
                  atual: textoDoValor(meta.valorAtualCentavos),
                  alvo: textoDoValor(meta.valorAlvoCentavos),
                })}
              </Texto>
            </View>
            {meta.concluida ? (
              <Etiqueta tom="receita" texto={t('metas.concluida')} />
            ) : (
              <Texto variante="titulo" className="font-negrito">
                {t('metas.percentual', { percentual: String(meta.percentual) })}
              </Texto>
            )}
          </View>
          <BarraProgresso
            percentual={meta.percentual}
            cor={tom?.barra}
            rotulo={t('metas.rotuloBarra', {
              titulo: meta.titulo,
              percentual: String(meta.percentual),
            })}
          />
          <View className="flex-row justify-between gap-2">
            <Texto variante="corpo-sm" cor="suave">
              {prazoDaMeta(meta.prazo)}
            </Texto>
            {meta.restanteCentavos > 0 ? (
              <Texto variante="corpo-sm" cor="suave" testID="meta-faltam">
                {t('metas.faltam', { valor: textoDoValor(meta.restanteCentavos) })}
              </Texto>
            ) : null}
          </View>
          {meta.concluida ? null : (
            <Botao
              titulo={t('metas.guardar')}
              larguraTotal
              aoPressionar={() => {
                definirGuardando(true);
              }}
            />
          )}
          <Botao
            variante="secundaria"
            titulo={meta.concluida ? t('metas.detalhe.reabrir') : t('metas.detalhe.concluir')}
            larguraTotal
            carregando={atualizar.isPending}
            aoPressionar={() => {
              atualizar.mutate({ id: meta.id, dados: { concluida: !meta.concluida } });
            }}
          />
          {atualizar.isError ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {mensagemDeErro(atualizar.error, t('metas.semConexao'))}
            </Texto>
          ) : null}
        </Card>

        <Card className="gap-1">
          <Texto cor="suave" className="font-forte" accessibilityRole="header">
            {t('metas.detalhe.aportes')}
          </Texto>
          {meta.aportes.length === 0 ? (
            <Texto cor="suave" className="py-2">
              {t('metas.detalhe.semAportes')}
            </Texto>
          ) : (
            meta.aportes.map((aporte, indice) => (
              <View
                key={aporte.id}
                className={
                  indice === 0
                    ? 'min-h-toque flex-row items-center gap-3'
                    : 'min-h-toque flex-row items-center gap-3 border-t border-borda'
                }
              >
                <Texto className="flex-1">{dataParaTexto(aporte.data)}</Texto>
                <Valor centavos={aporte.valorCentavos} tipo="receita" />
                <BotaoIcone
                  icone="trash"
                  rotulo={t('metas.detalhe.tirarAporte', {
                    valor: formatarCentavos(aporte.valorCentavos),
                    data: dataParaTexto(aporte.data),
                  })}
                  aoPressionar={() => {
                    excluirAporte.reset();
                    definirTirando(aporte);
                  }}
                />
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {guardando ? (
        <FolhaAporte
          meta={meta}
          aoFechar={() => {
            definirGuardando(false);
          }}
        />
      ) : null}
      <Folha
        visivel={tirando !== null}
        titulo={t('metas.detalhe.tirarTitulo', {
          valor: formatarCentavos(tirando?.valorCentavos ?? 0),
        })}
        aoFechar={() => {
          definirTirando(null);
        }}
        rodape={
          <>
            <Botao
              variante="perigo"
              larguraTotal
              titulo={t('metas.detalhe.tirarSim')}
              carregando={excluirAporte.isPending}
              aoPressionar={() => {
                if (tirando === null) return;
                excluirAporte.mutate(
                  { id: meta.id, aporteId: tirando.id },
                  {
                    onSuccess: () => {
                      definirTirando(null);
                    },
                  },
                );
              }}
            />
            <Botao
              variante="fantasma"
              titulo={t('metas.detalhe.cancelar')}
              aoPressionar={() => {
                definirTirando(null);
              }}
            />
          </>
        }
      >
        <Texto cor="suave">{t('metas.detalhe.tirarTexto')}</Texto>
        {excluirAporte.isError ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(excluirAporte.error, t('metas.semConexao'))}
          </Texto>
        ) : null}
      </Folha>
    </Tela>
  );
}
