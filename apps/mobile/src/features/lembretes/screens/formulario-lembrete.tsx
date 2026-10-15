import { REGEX_HORA } from '@mony/shared/notificacoes';
import { dataNoFuso, horaNoFuso, instanteNoFuso } from '@mony/shared/datas';
import {
  type CanalLembreteDisponivel,
  type DadosAtualizacaoLembrete,
  type Lembrete,
  TAMANHO_MAXIMO_TITULO_LEMBRETE,
} from '@mony/shared/lembretes';
import { diaDaSemana } from '@mony/shared/recorrencias';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { BotaoVerPlanos } from '@/features/planos/components/botao-ver-planos';
import { dataParaTexto, mascararData, textoParaData } from '@/features/transacoes/lib/periodo';
import { ehLimiteDoPlano, mensagemDeErro } from '@/lib/formularios';
import { useFusoDoUsuario } from '@/lib/fuso';
import { mascararHora } from '@/lib/mascaras';
import { relogio } from '@/lib/relogio';
import { Botao, CaixaDeSelecao, Cabecalho, Campo, Chip, GrupoOpcoes, Tela, Texto } from '@/ui';

import { FolhaPermissoesAlarme, permissoesParaPedir } from '../components/folha-permissoes-alarme';
import { useAtualizarLembrete, useCriarLembrete } from '../hooks/use-lembretes';
import {
  regraDaRepeticao,
  repeticaoDaRegra,
  type RepeticaoDoFormulario,
  SEM_REPETICAO,
  type TipoRepeticao,
} from '../lib/repeticao';

const TIPOS: readonly TipoRepeticao[] = ['nao', 'diaria', 'semanal', 'mensal', 'anual'];
/** A semana do formulário começa na segunda, como a do design. */
const DIAS = [1, 2, 3, 4, 5, 6, 0] as const;
const MS_POR_HORA = 60 * 60 * 1000;
/** Os campos curtos (hora e intervalo) ao lado do maior, em pt. */
const LARGURA_HORA = 112;
const LARGURA_INTERVALO = 144;

/** Sugestão para o novo: a próxima hora cheia, no fuso do usuário. */
function proximaHoraCheia(fuso: string): { data: string; hora: string } {
  const daqui = new Date(relogio.agora().getTime() + MS_POR_HORA);
  return { data: dataNoFuso(daqui, fuso), hora: `${horaNoFuso(daqui, fuso).slice(0, 2)}:00` };
}

type Problema = 'titulo' | 'data' | 'hora' | 'passado' | 'intervalo' | 'dias' | 'ate' | 'canais';

const iguais = (a: RepeticaoDoFormulario, b: RepeticaoDoFormulario) =>
  a.tipo === b.tipo &&
  (a.tipo === 'nao' ||
    ((a.intervalo.trim() || '1') === (b.intervalo.trim() || '1') &&
      [...a.dias].sort().join() === [...b.dias].sort().join() &&
      a.ate.trim() === b.ate.trim()));

export interface PropsFormularioLembrete {
  /** `null` para o novo. */
  original: Lembrete | null;
}

/**
 * Novo e editar lembrete (RN-075): o que lembrar, a data e a hora (no fuso do usuário), a repetição
 * (diária, semanal nos dias escolhidos, mensal ou anual, a cada N, até uma data) e como avisar
 * (notificação e alarme). A edição manda só o que mudou; o feito é lembrado de novo com uma data
 * nova. No primeiro com alarme, pede as liberações do Android que faltam.
 */
export function FormularioLembrete({ original }: PropsFormularioLembrete) {
  const { t } = useTranslation();
  const router = useRouter();
  const fuso = useFusoDoUsuario();
  const criar = useCriarLembrete();
  const atualizar = useAtualizarLembrete();
  const [chave] = useState(() => randomUUID());
  const inicial =
    original === null || original.status !== 'ativo'
      ? proximaHoraCheia(fuso)
      : {
          data: dataNoFuso(new Date(original.dataHora), fuso),
          hora: horaNoFuso(new Date(original.dataHora), fuso),
        };
  const repeticaoOriginal = repeticaoDaRegra(original?.recorrencia ?? null);
  const [titulo, definirTitulo] = useState(original?.titulo ?? '');
  const [data, definirData] = useState(dataParaTexto(inicial.data));
  const [hora, definirHora] = useState(inicial.hora);
  const [repeticao, definirRepeticao] = useState<RepeticaoDoFormulario>(
    original === null ? SEM_REPETICAO : repeticaoOriginal,
  );
  const [canais, definirCanais] = useState<CanalLembreteDisponivel[]>(
    original === null
      ? ['push']
      : original.canais.filter((canal): canal is CanalLembreteDisponivel => canal !== 'ligacao'),
  );
  const [tentou, definirTentou] = useState(false);
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);
  const [limite, definirLimite] = useState(false);
  const [permissoes, definirPermissoes] = useState<('alarmeExato' | 'telaCheia')[]>([]);
  const salvando = criar.isPending || atualizar.isPending;

  const dataEscolhida = textoParaData(data);
  const horaValida = REGEX_HORA.test(hora);
  const instante =
    dataEscolhida !== null && horaValida ? instanteNoFuso(dataEscolhida, hora, fuso) : null;
  const regra = regraDaRepeticao(repeticao, dataEscolhida);
  // O ativo que mantém a data não precisa estar no futuro (pode ter tocado e esperar o feito).
  const mudouHorario =
    original === null ||
    original.status !== 'ativo' ||
    instante === null ||
    instante.toISOString() !== new Date(original.dataHora).toISOString();
  const minuto = Math.floor(relogio.agora().getTime() / 60_000) * 60_000;

  const problemas: Problema[] = [];
  if (titulo.trim() === '') problemas.push('titulo');
  if (dataEscolhida === null) problemas.push('data');
  if (!horaValida) problemas.push('hora');
  if (instante !== null && mudouHorario && instante.getTime() < minuto) problemas.push('passado');
  if (!regra.ok) problemas.push(regra.problema);
  if (canais.length === 0) problemas.push('canais');
  const erro = (problema: Problema) =>
    tentou && problemas.includes(problema) ? t(`lembretes.formulario.validacao.${problema}`) : null;

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/lembretes');
  }

  function escolherTipo(tipo: TipoRepeticao) {
    definirRepeticao((atual) => ({
      ...atual,
      tipo,
      // Na semanal sem dias, começa pelo dia da data escolhida.
      dias:
        tipo === 'semanal' && atual.dias.length === 0 && dataEscolhida !== null
          ? [diaDaSemana(dataEscolhida)]
          : atual.dias,
    }));
  }

  function alternarDia(dia: number) {
    definirRepeticao((atual) => ({
      ...atual,
      dias: atual.dias.includes(dia)
        ? atual.dias.filter((escolhido) => escolhido !== dia)
        : [...atual.dias, dia],
    }));
  }

  function alternarCanal(canal: CanalLembreteDisponivel, marcado: boolean) {
    definirCanais((atuais) =>
      marcado ? [...new Set([...atuais, canal])] : atuais.filter((atual) => atual !== canal),
    );
  }

  async function salvar() {
    definirTentou(true);
    definirErroEnvio(null);
    definirLimite(false);
    if (problemas.length > 0 || instante === null || !regra.ok) return;
    try {
      if (original === null) {
        await criar.mutateAsync({
          chave,
          dados: {
            titulo: titulo.trim(),
            dataHora: instante.toISOString(),
            recorrencia: regra.recorrencia,
            canais,
          },
        });
      } else {
        const mudancas: DadosAtualizacaoLembrete = {
          ...(titulo.trim() === original.titulo ? {} : { titulo: titulo.trim() }),
          ...(mudouHorario ? { dataHora: instante.toISOString() } : {}),
          ...(iguais(repeticao, repeticaoOriginal) ? {} : { recorrencia: regra.recorrencia }),
          ...([...canais].sort().join() === [...original.canais].sort().join() ? {} : { canais }),
        };
        if (Object.keys(mudancas).length > 0) {
          await atualizar.mutateAsync({ id: original.id, dados: mudancas });
        }
      }
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('lembretes.semConexao')));
      definirLimite(ehLimiteDoPlano(falha));
      return;
    }
    const faltam = canais.includes('alarme') ? await permissoesParaPedir() : [];
    if (faltam.length > 0) definirPermissoes(faltam);
    else voltar();
  }

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Cabecalho
          titulo={original === null ? t('lembretes.novo') : t('lembretes.editar')}
          aoVoltar={voltar}
        />
        <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
          <Campo
            rotulo={t('lembretes.formulario.titulo')}
            placeholder={t('lembretes.formulario.tituloExemplo')}
            value={titulo}
            onChangeText={definirTitulo}
            maxLength={TAMANHO_MAXIMO_TITULO_LEMBRETE}
            erro={erro('titulo')}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Campo
                rotulo={t('lembretes.formulario.data')}
                ajuda={t('lembretes.formulario.dataAjuda')}
                value={data}
                onChangeText={(texto) => {
                  definirData(mascararData(texto));
                }}
                keyboardType="number-pad"
                maxLength={10}
                erro={erro('data') ?? erro('passado')}
              />
            </View>
            <View style={{ width: LARGURA_HORA }}>
              <Campo
                rotulo={t('lembretes.formulario.hora')}
                ajuda={t('lembretes.formulario.horaAjuda')}
                value={hora}
                onChangeText={(texto) => {
                  definirHora(mascararHora(texto));
                }}
                keyboardType="number-pad"
                maxLength={5}
                erro={erro('hora')}
              />
            </View>
          </View>

          <GrupoOpcoes
            titulo={t('lembretes.formulario.repeticao')}
            opcoes={TIPOS.map((tipo) => ({
              valor: tipo,
              rotulo: t(`lembretes.repeticao.${tipo}`),
            }))}
            selecionado={repeticao.tipo}
            aoEscolher={escolherTipo}
          />
          {repeticao.tipo === 'semanal' ? (
            <View className="gap-2">
              <Texto variante="corpo-sm" cor="suave" className="font-forte">
                {t('lembretes.formulario.dias')}
              </Texto>
              <View className="flex-row flex-wrap gap-2">
                {DIAS.map((dia) => (
                  <Chip
                    key={dia}
                    rotulo={t('lembretes.repeticao.diasCurtos', { returnObjects: true })[dia] ?? ''}
                    selecionado={repeticao.dias.includes(dia)}
                    aoPressionar={() => {
                      alternarDia(dia);
                    }}
                  />
                ))}
              </View>
              {erro('dias') === null ? null : (
                <Texto variante="corpo-sm" cor="perigo">
                  {erro('dias')}
                </Texto>
              )}
            </View>
          ) : null}
          {repeticao.tipo === 'nao' ? null : (
            <View className="flex-row gap-3">
              <View style={{ width: LARGURA_INTERVALO }}>
                <Campo
                  rotulo={t('lembretes.formulario.intervalo')}
                  ajuda={t('lembretes.formulario.intervaloAjuda')}
                  value={repeticao.intervalo}
                  onChangeText={(texto) => {
                    definirRepeticao((atual) => ({
                      ...atual,
                      intervalo: texto.replace(/\D/g, '').slice(0, 2),
                    }));
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  erro={erro('intervalo')}
                />
              </View>
              <View className="flex-1">
                <Campo
                  rotulo={t('lembretes.formulario.ate')}
                  ajuda={t('lembretes.formulario.ateAjuda')}
                  value={repeticao.ate}
                  onChangeText={(texto) => {
                    definirRepeticao((atual) => ({ ...atual, ate: mascararData(texto) }));
                  }}
                  keyboardType="number-pad"
                  maxLength={10}
                  erro={erro('ate')}
                />
              </View>
            </View>
          )}

          <View className="gap-2">
            <Texto variante="corpo-sm" cor="suave" className="font-forte">
              {t('lembretes.formulario.canais')}
            </Texto>
            <CaixaDeSelecao
              rotulo={t('lembretes.formulario.push')}
              marcada={canais.includes('push')}
              aoMudar={(marcada) => {
                alternarCanal('push', marcada);
              }}
            />
            <CaixaDeSelecao
              rotulo={t('lembretes.formulario.alarme')}
              marcada={canais.includes('alarme')}
              aoMudar={(marcada) => {
                alternarCanal('alarme', marcada);
              }}
              erro={erro('canais')}
            />
          </View>

          {erroEnvio === null ? null : (
            <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
              {erroEnvio}
            </Texto>
          )}
          {limite ? <BotaoVerPlanos /> : null}
          <Botao
            titulo={t('lembretes.formulario.salvar')}
            larguraTotal
            carregando={salvando}
            aoPressionar={() => void salvar()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <FolhaPermissoesAlarme
        faltam={permissoes}
        aoFechar={() => {
          definirPermissoes([]);
          voltar();
        }}
      />
    </Tela>
  );
}
