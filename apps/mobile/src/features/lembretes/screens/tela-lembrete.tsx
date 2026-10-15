import { ErroApi } from '@mony/api-client';
import type { OpcaoAdiar } from '@mony/shared/lembretes';
import { diaDaSemana } from '@mony/shared/recorrencias';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { BotaoSair } from '@/features/compartilhamentos/components/botao-sair';
import { FolhaCompartilhar } from '@/features/compartilhamentos/components/folha-compartilhar';
import { PessoasDoRecurso } from '@/features/compartilhamentos/components/pessoas-do-recurso';
import { useCompartilhamentos } from '@/features/compartilhamentos/hooks/use-compartilhamentos';
import {
  enviadosDoRecurso,
  nomesDasPessoas,
} from '@/features/compartilhamentos/lib/compartilhamentos';
import { dataParaTexto } from '@/features/transacoes/lib/periodo';
import { mensagemDeErro } from '@/lib/formularios';
import { useFusoDoUsuario } from '@/lib/fuso';
import {
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
} from '@/ui';

import {
  useAdiarLembrete,
  useConcluirLembrete,
  useExcluirLembrete,
  useLembrete,
} from '../hooks/use-lembretes';
import { momentoLocal } from '../lib/agenda';
import { useTextoDaRepeticao } from '../lib/repeticao';

const OPCOES_ADIAR: readonly { opcao: OpcaoAdiar; chave: 'dezMinutos' | 'umaHora' | 'amanha' }[] = [
  { opcao: '10min', chave: 'dezMinutos' },
  { opcao: '1h', chave: 'umaHora' },
  { opcao: 'amanha', chave: 'amanha' },
];

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View className="gap-0.5">
      <Texto variante="legenda" cor="suave" className="font-forte">
        {rotulo}
      </Texto>
      <Texto>{valor}</Texto>
    </View>
  );
}

/**
 * O lembrete (`/lembretes/<id>`, também aberto pela notificação): quando toca, a repetição e os
 * canais. Daqui ele fica feito ([Feito]; na repetição, pula para a próxima), é adiado (10 min,
 * 1 h ou amanhã, RN-076), editado ou excluído. O feito pode ser lembrado de novo (com data nova).
 *
 * Compartilhado (RN-074, T-124d): só o dono edita, exclui e convida; com `editar`, quem recebeu dá
 * o [Feito] e adia; com `ver`, só vê. Quem recebeu pode sair do lembrete.
 */
export default function TelaLembrete() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const fuso = useFusoDoUsuario();
  const consulta = useLembrete(id);
  const concluir = useConcluirLembrete();
  const adiar = useAdiarLembrete();
  const excluir = useExcluirLembrete();
  const textoDaRepeticao = useTextoDaRepeticao();
  const semana = t('comum.semana', { returnObjects: true });
  const [adiando, definirAdiando] = useState(false);
  const [excluindo, definirExcluindo] = useState(false);
  const [compartilhando, definirCompartilhando] = useState(false);
  const compartilhamentos = useCompartilhamentos();
  const lembrete = consulta.data;

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/lembretes');
  }

  if (lembrete === undefined) {
    const naoEncontrado = consulta.error instanceof ErroApi && consulta.error.status === 404;
    return (
      <Tela className="gap-4 px-4 pt-2">
        <Cabecalho titulo={t('lembretes.titulo')} aoVoltar={voltar} />
        {consulta.isPending ? (
          <Skeleton altura={180} />
        ) : naoEncontrado ? (
          <Texto cor="suave">{t('lembretes.detalhe.naoEncontrado')}</Texto>
        ) : (
          <Erro aoTentarDeNovo={() => void consulta.refetch()} />
        )}
      </Tela>
    );
  }

  const ativo = lembrete.status === 'ativo';
  const ehDono = lembrete.acesso === 'dono';
  const podeAgir = lembrete.acesso !== 'ver';
  const enviados = ehDono ? enviadosDoRecurso(compartilhamentos.data, 'lembrete', id) : [];
  const { data, hora } = momentoLocal(lembrete.dataHora, fuso);
  const quando = t('lembretes.detalhe.dataHora', {
    dia: semana[diaDaSemana(data)] ?? '',
    data: dataParaTexto(data),
    hora,
  });
  const erro = concluir.error ?? adiar.error;

  function editar() {
    router.push({ pathname: '/lembretes/[id]/editar', params: { id } });
  }

  return (
    <Tela className="gap-4 px-4 pt-2">
      <Cabecalho
        titulo={t('lembretes.titulo')}
        aoVoltar={voltar}
        acao={
          ehDono ? (
            <BotaoIcone
              icone="user-plus"
              comFundo
              rotulo={t('compartilhamentos.compartilhar')}
              aoPressionar={() => {
                definirCompartilhando(true);
              }}
            />
          ) : undefined
        }
      />
      <ScrollView contentContainerClassName="gap-4 pb-8">
        <Card className="gap-4">
          <View className="flex-row items-start gap-3">
            <Texto variante="titulo" className="flex-1" accessibilityRole="header">
              {lembrete.titulo}
            </Texto>
            {ativo ? null : <Etiqueta texto={t('lembretes.detalhe.feito')} tom="receita" />}
          </View>
          <Linha rotulo={t('lembretes.detalhe.quando')} valor={quando} />
          {lembrete.recorrencia === null ? null : (
            <Linha
              rotulo={t('lembretes.detalhe.repeticao')}
              valor={textoDaRepeticao(lembrete.recorrencia)}
            />
          )}
          <Linha
            rotulo={t('lembretes.detalhe.canais')}
            valor={lembrete.canais
              .map((canal) => t(`lembretes.formulario.${canal === 'alarme' ? 'alarme' : 'push'}`))
              .join(' · ')}
          />
          {lembrete.adiadoAte === null ? null : (
            <Texto cor="atencao" className="font-forte">
              {t('lembretes.adiadoAte', { hora: momentoLocal(lembrete.adiadoAte, fuso).hora })}
            </Texto>
          )}
          {lembrete.pendente ? (
            <Texto cor="atencao">{t('lembretes.detalhe.pendente')}</Texto>
          ) : null}
          <PessoasDoRecurso
            recurso="lembrete"
            acesso={lembrete.acesso}
            dono={lembrete.dono}
            quantidade={lembrete.compartilhadoCom}
            nomes={nomesDasPessoas(lembrete.dono, enviados)}
            aoPressionar={
              ehDono
                ? () => {
                    definirCompartilhando(true);
                  }
                : undefined
            }
          />
        </Card>

        {erro ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(erro, t('lembretes.semConexao'))}
          </Texto>
        ) : null}
        {ativo && podeAgir ? (
          <>
            <Botao
              titulo={t('lembretes.detalhe.feito')}
              icone="check"
              larguraTotal
              carregando={concluir.isPending}
              aoPressionar={() => {
                concluir.mutate(id);
              }}
            />
            <Botao
              variante="secundaria"
              titulo={t('lembretes.detalhe.adiar')}
              icone="clock"
              larguraTotal
              aoPressionar={() => {
                adiar.reset();
                definirAdiando(true);
              }}
            />
          </>
        ) : null}
        {!ehDono ? null : ativo ? (
          <Botao
            variante="secundaria"
            titulo={t('lembretes.detalhe.editar')}
            larguraTotal
            aoPressionar={editar}
          />
        ) : (
          <Botao titulo={t('lembretes.detalhe.lembrarDeNovo')} larguraTotal aoPressionar={editar} />
        )}
        {ehDono ? (
          <Botao
            variante="perigo"
            icone="trash"
            titulo={t('lembretes.detalhe.excluir')}
            larguraTotal
            aoPressionar={() => {
              excluir.reset();
              definirExcluindo(true);
            }}
          />
        ) : lembrete.dono === null ? null : (
          <BotaoSair
            recurso="lembrete"
            recursoId={id}
            donoNome={lembrete.dono.nome}
            aoSair={() => {
              router.dismissTo('/lembretes');
            }}
          />
        )}
      </ScrollView>
      {ehDono ? (
        <FolhaCompartilhar
          recurso="lembrete"
          recursoId={id}
          visivel={compartilhando}
          aoFechar={() => {
            definirCompartilhando(false);
          }}
        />
      ) : null}

      <Folha
        visivel={adiando}
        titulo={t('lembretes.adiamento.titulo')}
        aoFechar={() => {
          definirAdiando(false);
        }}
        rodape={
          <Botao
            variante="fantasma"
            titulo={t('lembretes.adiamento.cancelar')}
            aoPressionar={() => {
              definirAdiando(false);
            }}
          />
        }
      >
        {OPCOES_ADIAR.map(({ opcao, chave }) => (
          <Botao
            key={opcao}
            variante="secundaria"
            titulo={t(`lembretes.adiamento.${chave}`)}
            larguraTotal
            desabilitado={adiar.isPending}
            aoPressionar={() => {
              adiar.mutate(
                { id, opcao },
                {
                  onSettled: () => {
                    definirAdiando(false);
                  },
                },
              );
            }}
          />
        ))}
      </Folha>

      <Folha
        visivel={excluindo}
        titulo={t('lembretes.exclusao.titulo', { titulo: lembrete.titulo })}
        aoFechar={() => {
          definirExcluindo(false);
        }}
        rodape={
          <>
            <Botao
              variante="perigo"
              larguraTotal
              titulo={t('lembretes.exclusao.confirmar')}
              carregando={excluir.isPending}
              aoPressionar={() => {
                excluir.mutate(id, {
                  onSuccess: () => {
                    definirExcluindo(false);
                    router.dismissTo('/lembretes');
                  },
                });
              }}
            />
            <Botao
              variante="fantasma"
              titulo={t('lembretes.exclusao.cancelar')}
              aoPressionar={() => {
                definirExcluindo(false);
              }}
            />
          </>
        }
      >
        <Texto cor="suave">{t('lembretes.exclusao.texto')}</Texto>
        {excluir.isError ? (
          <Texto cor="perigo" accessibilityRole="alert">
            {mensagemDeErro(excluir.error, t('lembretes.semConexao'))}
          </Texto>
        ) : null}
      </Folha>
    </Tela>
  );
}
