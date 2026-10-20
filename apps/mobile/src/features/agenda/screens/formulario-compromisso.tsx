import {
  type Compromisso,
  type DadosAtualizacaoCompromisso,
  TAMANHO_MAXIMO_LOCAL_COMPROMISSO,
  TAMANHO_MAXIMO_TITULO_COMPROMISSO,
} from '@mony/shared/agenda';
import { type DataCalendario, dataNoFuso, horaNoFuso, instanteNoFuso } from '@mony/shared/datas';
import { REGEX_HORA } from '@mony/shared/notificacoes';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { dataParaTexto, mascararData, textoParaData } from '@/features/transacoes/lib/periodo';
import { mensagemDeErro } from '@/lib/formularios';
import { useFusoDoUsuario } from '@/lib/fuso';
import { mascararHora } from '@/lib/mascaras';
import { relogio } from '@/lib/relogio';
import { Botao, Cabecalho, Campo, Folha, Tela, Texto } from '@/ui';

import {
  useAgendas,
  useAtualizarCompromisso,
  useCriarCompromisso,
  useExcluirCompromisso,
} from '../hooks/use-agenda';

const MS_POR_HORA = 60 * 60 * 1000;
const LARGURA_HORA = 112;

type Problema = 'titulo' | 'data' | 'inicio' | 'fim';

/** Sugestão para o novo: a próxima hora cheia (no dia escolhido na agenda, se veio um). */
function sugestao(fuso: string, dia: DataCalendario | null): { data: string; hora: string } {
  const daqui = new Date(relogio.agora().getTime() + MS_POR_HORA);
  return {
    data: dia ?? dataNoFuso(daqui, fuso),
    hora: `${horaNoFuso(daqui, fuso).slice(0, 2)}:00`,
  };
}

export interface PropsFormularioCompromisso {
  /** `null` para o novo. */
  original: Compromisso | null;
  /** O dia escolhido na agenda, para o novo. */
  dia?: DataCalendario | null;
}

/**
 * Novo e editar compromisso (RN-079): o que é, a data, quando começa e termina (no fuso do usuário,
 * o fim no mesmo dia e opcional) e onde. O novo vai para a agenda padrão; a edição manda só o que
 * mudou. Só os do app e da Mony chegam aqui; excluir tira também da agenda conectada.
 */
export function FormularioCompromisso({ original, dia = null }: PropsFormularioCompromisso) {
  const { t } = useTranslation();
  const router = useRouter();
  const fuso = useFusoDoUsuario();
  const agendas = useAgendas();
  const criar = useCriarCompromisso();
  const atualizar = useAtualizarCompromisso();
  const excluir = useExcluirCompromisso();
  const [chave] = useState(() => randomUUID());
  // Fica a da abertura: é com ela que a edição sabe o que mudou.
  const [inicial] = useState(() =>
    original === null
      ? { ...sugestao(fuso, dia), fim: '' }
      : {
          data: dataNoFuso(new Date(original.inicio), fuso),
          hora: horaNoFuso(new Date(original.inicio), fuso),
          fim: original.fim === null ? '' : horaNoFuso(new Date(original.fim), fuso),
        },
  );
  const [titulo, definirTitulo] = useState(original?.titulo ?? '');
  const [data, definirData] = useState(dataParaTexto(inicial.data));
  const [inicio, definirInicio] = useState(inicial.hora);
  const [fim, definirFim] = useState(inicial.fim);
  const [local, definirLocal] = useState(original?.local ?? '');
  const [tentou, definirTentou] = useState(false);
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const [confirmarExclusao, definirConfirmarExclusao] = useState(false);
  const salvando = criar.isPending || atualizar.isPending;

  const dataEscolhida = textoParaData(data);
  const instanteInicio =
    dataEscolhida !== null && REGEX_HORA.test(inicio)
      ? instanteNoFuso(dataEscolhida, inicio, fuso)
      : null;
  // O fim só é recalculado quando o horário muda: o que termina em outro dia (vindo da Mony) fica.
  const mudouHorario =
    original === null || data !== dataParaTexto(inicial.data) || inicio !== inicial.hora;
  const mudouFim = mudouHorario || fim !== inicial.fim;
  const instanteFim =
    fim.trim() === '' || dataEscolhida === null || !REGEX_HORA.test(fim)
      ? null
      : instanteNoFuso(dataEscolhida, fim, fuso);
  const fimInvalido =
    mudouFim &&
    fim.trim() !== '' &&
    (instanteFim === null ||
      (instanteInicio !== null && instanteFim.getTime() <= instanteInicio.getTime()));

  const problemas: Problema[] = [];
  if (titulo.trim() === '') problemas.push('titulo');
  if (dataEscolhida === null) problemas.push('data');
  else if (!REGEX_HORA.test(inicio)) problemas.push('inicio');
  if (fimInvalido) problemas.push('fim');
  const erro = (problema: Problema) =>
    tentou && problemas.includes(problema) ? t(`agenda.formulario.validacao.${problema}`) : null;

  const padrao = agendas.data?.itens.find((agenda) => agenda.padrao) ?? null;

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/agenda');
  }

  async function salvar() {
    definirTentou(true);
    definirErroEnvio(null);
    if (problemas.length > 0 || instanteInicio === null) return;
    const localLimpo = local.trim() === '' ? null : local.trim();
    try {
      if (original === null) {
        await criar.mutateAsync({
          chave,
          dados: {
            titulo: titulo.trim(),
            inicio: instanteInicio.toISOString(),
            fim: instanteFim?.toISOString() ?? null,
            local: localLimpo,
          },
        });
      } else {
        const mudancas: DadosAtualizacaoCompromisso = {
          ...(titulo.trim() === original.titulo ? {} : { titulo: titulo.trim() }),
          ...(mudouHorario ? { inicio: instanteInicio.toISOString() } : {}),
          ...(mudouFim && (instanteFim?.toISOString() ?? null) !== original.fim
            ? { fim: instanteFim?.toISOString() ?? null }
            : {}),
          ...(localLimpo === original.local ? {} : { local: localLimpo }),
        };
        if (Object.keys(mudancas).length > 0) {
          await atualizar.mutateAsync({ id: original.id, dados: mudancas });
        }
      }
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('agenda.semConexao')));
      return;
    }
    voltar();
  }

  function excluirAgora() {
    if (original === null) return;
    excluir.mutate(original.id, {
      onSuccess: () => {
        definirConfirmarExclusao(false);
        router.dismissTo('/agenda');
      },
    });
  }

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Cabecalho
          titulo={original === null ? t('agenda.novo') : t('agenda.editar')}
          aoVoltar={voltar}
        />
        <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
          <Campo
            rotulo={t('agenda.formulario.titulo')}
            placeholder={t('agenda.formulario.tituloExemplo')}
            value={titulo}
            onChangeText={definirTitulo}
            maxLength={TAMANHO_MAXIMO_TITULO_COMPROMISSO}
            erro={erro('titulo')}
          />
          <Campo
            rotulo={t('agenda.formulario.data')}
            ajuda={t('agenda.formulario.dataAjuda')}
            value={data}
            onChangeText={(texto) => {
              definirData(mascararData(texto));
            }}
            keyboardType="number-pad"
            maxLength={10}
            erro={erro('data')}
          />
          <View className="flex-row gap-3">
            <View style={{ width: LARGURA_HORA }}>
              <Campo
                rotulo={t('agenda.formulario.inicio')}
                ajuda={t('agenda.formulario.horaAjuda')}
                value={inicio}
                onChangeText={(texto) => {
                  definirInicio(mascararHora(texto));
                }}
                keyboardType="number-pad"
                maxLength={5}
                erro={erro('inicio')}
              />
            </View>
            <View style={{ width: LARGURA_HORA }}>
              <Campo
                rotulo={t('agenda.formulario.fim')}
                ajuda={t('agenda.formulario.fimAjuda')}
                value={fim}
                onChangeText={(texto) => {
                  definirFim(mascararHora(texto));
                }}
                keyboardType="number-pad"
                maxLength={5}
                erro={erro('fim')}
              />
            </View>
          </View>
          <Campo
            rotulo={t('agenda.formulario.local')}
            placeholder={t('agenda.formulario.localExemplo')}
            value={local}
            onChangeText={definirLocal}
            maxLength={TAMANHO_MAXIMO_LOCAL_COMPROMISSO}
          />
          {original === null && agendas.data ? (
            <Texto variante="corpo-sm" cor="suave">
              {padrao === null
                ? t('agenda.formulario.soNoMony')
                : t('agenda.formulario.vaiPara', {
                    agenda: t(`agenda.fontes.${padrao.provedor}`),
                  })}
            </Texto>
          ) : null}

          {erroEnvio === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {erroEnvio}
            </Texto>
          )}
          <Botao
            titulo={t('agenda.formulario.salvar')}
            larguraTotal
            carregando={salvando}
            aoPressionar={() => void salvar()}
          />
          {original === null ? null : (
            <Botao
              titulo={t('agenda.formulario.excluir')}
              variante="perigo"
              larguraTotal
              aoPressionar={() => {
                definirConfirmarExclusao(true);
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <Folha
        visivel={confirmarExclusao}
        titulo={t('agenda.excluir.titulo')}
        aoFechar={() => {
          definirConfirmarExclusao(false);
          excluir.reset();
        }}
      >
        <View className="gap-3">
          <Texto>{t('agenda.excluir.texto')}</Texto>
          {excluir.isError ? (
            <Texto cor="perigo" accessibilityRole="alert">
              {mensagemDeErro(excluir.error, t('agenda.semConexao'))}
            </Texto>
          ) : null}
          <Botao
            titulo={t('agenda.excluir.confirmar')}
            variante="perigo"
            larguraTotal
            carregando={excluir.isPending}
            aoPressionar={excluirAgora}
          />
          <Botao
            titulo={t('agenda.excluir.cancelar')}
            variante="fantasma"
            larguraTotal
            aoPressionar={() => {
              definirConfirmarExclusao(false);
              excluir.reset();
            }}
          />
        </View>
      </Folha>
    </Tela>
  );
}
