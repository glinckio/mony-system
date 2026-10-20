import type { Compromisso, ResultadoConexaoAgenda } from '@mony/shared/agenda';
import { type DataCalendario, ehDataCalendario } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { useTituloDoMes } from '@/lib/datas-texto';
import { useFusoDoUsuario, useHoje } from '@/lib/fuso';
import {
  BotaoIcone,
  Cabecalho,
  Card,
  Chip,
  Erro,
  juntarClasses,
  Skeleton,
  Tela,
  Texto,
  Vazio,
} from '@/ui';
import { cores } from '@/ui/tokens';

import { FolhaAgendas } from '../components/folha-agendas';
import { resultadoDaConexao, useAgendaDoPeriodo, useAgendas } from '../hooks/use-agenda';
import {
  compromissosDoDia,
  type CompromissoDoDia,
  diasDaSemana,
  FONTES,
  type FonteCompromisso,
  fonteDoCompromisso,
  inicioDaSemana,
  periodoDaSemana,
} from '../lib/semana';

/** O ponto de cada agenda (design, página 7). */
export const COR_DA_FONTE: Record<FonteCompromisso, string> = {
  google: cores.receita,
  outlook: cores.link,
  aparelho: cores.atencao,
  monitorizze: cores.primaria,
};

function Ponto({ fonte }: { fonte: FonteCompromisso }) {
  return (
    <View
      className="rounded-total"
      style={{ width: 8, height: 8, backgroundColor: COR_DA_FONTE[fonte] }}
    />
  );
}

/** A faixa da semana: o dia da semana e o número; o escolhido fica claro. */
function FaixaDaSemana({
  dias,
  escolhido,
  hoje,
  aoEscolher,
}: {
  dias: DataCalendario[];
  escolhido: DataCalendario;
  hoje: DataCalendario;
  aoEscolher: (dia: DataCalendario) => void;
}) {
  const { t } = useTranslation();
  const curtos = t('agenda.diasCurtos', { returnObjects: true });
  const semana = t('comum.semana', { returnObjects: true });
  const meses = t('comum.meses', { returnObjects: true });
  return (
    <View className="flex-row justify-between" accessibilityRole="tablist">
      {dias.map((dia, indice) => {
        const selecionado = dia === escolhido;
        const numero = Number(dia.slice(8, 10));
        return (
          <Pressable
            key={dia}
            accessibilityRole="tab"
            accessibilityState={{ selected: selecionado }}
            accessibilityLabel={t('agenda.diaRotulo', {
              semana: semana[(indice + 1) % 7] ?? '',
              dia: numero,
              mes: meses[Number(dia.slice(5, 7)) - 1] ?? '',
            })}
            onPress={() => {
              aoEscolher(dia);
            }}
            className={juntarClasses(
              'min-h-toque items-center gap-1 rounded-md px-2 py-2',
              selecionado && 'bg-claro',
            )}
            style={{ minWidth: 40 }}
          >
            <Texto variante="legenda" cor={selecionado ? 'inverso' : 'suave'}>
              {curtos[indice] ?? ''}
            </Texto>
            <Texto
              cor={selecionado ? 'inverso' : dia === hoje ? 'link' : 'texto'}
              className="font-forte"
            >
              {String(numero)}
            </Texto>
          </Pressable>
        );
      })}
    </View>
  );
}

function LinhaCompromisso({ item, aoAbrir }: { item: CompromissoDoDia; aoAbrir: () => void }) {
  const { t } = useTranslation();
  const { compromisso, hora, ate } = item;
  const fonte = fonteDoCompromisso(compromisso);
  const detalhes = [
    ate === null ? null : t('agenda.ate', { hora: ate }),
    compromisso.origem === 'mony' ? t('agenda.pelaMony') : null,
    compromisso.local,
    t(`agenda.fontes.${fonte}`),
  ].filter((parte): parte is string => parte !== null && parte !== '');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={aoAbrir}
      className="min-h-toque flex-row gap-3 py-2 active:opacity-80"
      testID={`compromisso-${compromisso.id}`}
    >
      <Texto className="font-forte" style={{ width: 64 }}>
        {hora ?? t('agenda.continua')}
      </Texto>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Ponto fonte={fonte} />
          <Texto className="flex-1 font-forte" numberOfLines={2}>
            {compromisso.titulo}
          </Texto>
        </View>
        <Texto variante="corpo-sm" cor="suave" className="pl-4">
          {detalhes.join(' · ')}
        </Texto>
      </View>
    </Pressable>
  );
}

/**
 * Agenda (`/agenda`, design, página 7; RN-079): a semana de segunda a domingo, os compromissos do
 * dia escolhido (os do app, os da Mony e os do Google e do Outlook) e os filtros por agenda. O "+"
 * marca um novo; tocar abre (os do app e da Mony editam, os de fora só mostram). Aberta pela grade
 * de Mais, pelo aviso do compromisso e pelo [Ver agenda] da Mony (`mony://agenda`). O calendário
 * do topo abre Suas agendas (T-085e).
 */
export default function TelaAgenda() {
  const { t } = useTranslation();
  const router = useRouter();
  const fuso = useFusoDoUsuario();
  const hoje = useHoje();
  const tituloDoMes = useTituloDoMes();
  const parametros = useLocalSearchParams<{ dia?: string; conexao?: string }>();
  const [escolhido, definirEscolhido] = useState<DataCalendario>(() =>
    parametros.dia !== undefined && ehDataCalendario(parametros.dia) ? parametros.dia : hoje,
  );
  const [escondidas, definirEscondidas] = useState<FonteCompromisso[]>([]);
  const [verAgendas, definirVerAgendas] = useState(false);
  // A volta do Google e do Outlook: no navegador do app (a folha) ou pelo link `?conexao=`.
  const [conexao, definirConexao] = useState<ResultadoConexaoAgenda | null>(() =>
    resultadoDaConexao(`?conexao=${parametros.conexao ?? ''}`),
  );
  const segunda = inicioDaSemana(escolhido);
  const consulta = useAgendaDoPeriodo(periodoDaSemana(segunda, fuso));
  const agendas = useAgendas();

  const itens = consulta.data?.itens ?? [];
  const fontes = FONTES.filter(
    (fonte) =>
      fonte === 'monitorizze' ||
      agendas.data?.itens.some(({ provedor }) => provedor === fonte) === true ||
      itens.some((compromisso) => fonteDoCompromisso(compromisso) === fonte),
  );
  const doDia = compromissosDoDia(itens, escolhido, fuso).filter(
    ({ compromisso }) => !escondidas.includes(fonteDoCompromisso(compromisso)),
  );

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/mais');
  }

  function novo() {
    router.push({ pathname: '/agenda/novo', params: { dia: escolhido } });
  }

  const abrir = (compromisso: Compromisso) => () => {
    router.push({ pathname: '/agenda/[id]', params: { id: compromisso.id } });
  };

  function alternar(fonte: FonteCompromisso) {
    definirEscondidas((atuais) =>
      atuais.includes(fonte) ? atuais.filter((atual) => atual !== fonte) : [...atuais, fonte],
    );
  }

  function conteudo() {
    if (consulta.isPending) {
      return (
        <View className="gap-3">
          <Skeleton altura={56} />
          <Skeleton altura={56} />
        </View>
      );
    }
    if (consulta.isError) return <Erro aoTentarDeNovo={() => void consulta.refetch()} />;
    if (doDia.length === 0) {
      return (
        <Card>
          <Vazio
            titulo={t('agenda.vazio.titulo')}
            descricao={t('agenda.vazio.descricao')}
            acao={{ titulo: t('agenda.novo'), aoPressionar: novo }}
          />
        </Card>
      );
    }
    return (
      <Card className="gap-1" testID="agenda-dia">
        {doDia.map((item) => (
          <LinhaCompromisso
            key={item.compromisso.id}
            item={item}
            aoAbrir={abrir(item.compromisso)}
          />
        ))}
      </Card>
    );
  }

  return (
    <Tela className="gap-3 px-4 pt-2">
      <Cabecalho
        titulo={t('agenda.titulo')}
        aoVoltar={voltar}
        acao={
          <View className="flex-row gap-2">
            <BotaoIcone
              icone="calendar"
              comFundo
              rotulo={t('agenda.agendas.abrir')}
              aoPressionar={() => {
                definirConexao(null);
                definirVerAgendas(true);
              }}
            />
            <BotaoIcone icone="plus" comFundo rotulo={t('agenda.novo')} aoPressionar={novo} />
          </View>
        }
      />
      {conexao === null ? null : (
        <Texto
          cor={conexao === 'erro' ? 'perigo' : 'suave'}
          accessibilityRole={conexao === 'erro' ? 'alert' : 'text'}
          accessibilityLiveRegion="polite"
        >
          {t(`agenda.agendas.conexao.${conexao}`)}
        </Texto>
      )}
      <View className="flex-row items-center gap-1">
        <Texto variante="corpo-sm" cor="suave" className="flex-1">
          {tituloDoMes(escolhido)}
        </Texto>
        <BotaoIcone
          icone="chevron-left"
          rotulo={t('agenda.semanaAnterior')}
          aoPressionar={() => {
            definirEscolhido(somarDias(escolhido, -7));
          }}
        />
        <BotaoIcone
          icone="chevron-right"
          rotulo={t('agenda.proximaSemana')}
          aoPressionar={() => {
            definirEscolhido(somarDias(escolhido, 7));
          }}
        />
      </View>
      <FaixaDaSemana
        dias={diasDaSemana(segunda)}
        escolhido={escolhido}
        hoje={hoje}
        aoEscolher={definirEscolhido}
      />
      {fontes.length > 1 ? (
        <View className="flex-row flex-wrap gap-2" accessibilityLabel={t('agenda.filtrosRotulo')}>
          {fontes.map((fonte) => (
            <Chip
              key={fonte}
              rotulo={t(`agenda.fontes.${fonte}`)}
              selecionado={!escondidas.includes(fonte)}
              aoPressionar={() => {
                alternar(fonte);
              }}
            />
          ))}
        </View>
      ) : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 pb-6"
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor={cores.texto}
            onRefresh={() => {
              void consulta.refetch();
              void agendas.refetch();
            }}
          />
        }
      >
        {conteudo()}
      </ScrollView>
      <FolhaAgendas
        visivel={verAgendas}
        aoFechar={() => {
          definirVerAgendas(false);
        }}
        aoConectar={(resultado) => {
          definirConexao(resultado);
          if (resultado === 'sucesso') definirVerAgendas(false);
        }}
      />
    </Tela>
  );
}
