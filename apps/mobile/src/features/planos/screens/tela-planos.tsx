import { formatarCentavos } from '@mony/shared/dinheiro';
import { dataNoFuso } from '@mony/shared/datas';
import type { PlanoPago } from '@mony/shared/enums';
import type { PlanosAVenda, UsoPlano } from '@mony/shared/planos';
import { usePlanosPlanos } from '@mony/api-client';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { useAssinar } from '@/features/planos/hooks/use-cobranca';
import { usePlano } from '@/features/planos/hooks/use-plano';
import { useFusoDoUsuario } from '@/lib/fuso';
import { relogio } from '@/lib/relogio';
import {
  Botao,
  BotaoIcone,
  Card,
  Erro,
  Etiqueta,
  Icone,
  juntarClasses,
  Skeleton,
  Tela,
  Texto,
} from '@/ui';
import { cores } from '@/ui/tokens';

const MS_POR_DIA = 86_400_000;

/** Dias de calendário, no fuso do usuário, de hoje até o fim do teste (0 = termina hoje). */
export function diasAteOFim(fim: Date, agora: Date, fuso: string): number {
  const dia = (data: string) => Date.parse(`${data}T00:00:00Z`);
  return Math.max(
    0,
    Math.round((dia(dataNoFuso(fim, fuso)) - dia(dataNoFuso(agora, fuso))) / MS_POR_DIA),
  );
}

function SeloDoTeste({ testeFim }: { testeFim: string }) {
  const { t } = useTranslation();
  const fuso = useFusoDoUsuario();
  const dias = diasAteOFim(new Date(testeFim), relogio.agora(), fuso);
  const texto =
    dias === 0
      ? t('planos.venda.testeHoje')
      : dias === 1
        ? t('planos.venda.testeAmanha')
        : t('planos.venda.testeDias', { dias });
  return (
    <View className="rounded-total border border-vidro-forte bg-vidro px-4 py-2">
      <Texto variante="corpo-sm" className="font-forte">
        {texto}
      </Texto>
    </View>
  );
}

interface PropsOpcaoPlano {
  titulo: string;
  ajuda: string;
  valor: string;
  periodo: string;
  selecionado: boolean;
  selo?: string;
  aoEscolher: () => void;
}

/** Um plano para escolher, com o círculo de seleção do design. */
function OpcaoPlano({
  titulo,
  ajuda,
  valor,
  periodo,
  selecionado,
  selo,
  aoEscolher,
}: PropsOpcaoPlano) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${titulo}, ${valor}${periodo}`}
      accessibilityState={{ checked: selecionado }}
      onPress={aoEscolher}
      className={juntarClasses(
        'flex-row items-center gap-4 rounded-lg border-2 bg-superficie px-4 py-4 active:opacity-80',
        selecionado ? 'border-claro' : 'border-borda',
      )}
    >
      <View
        className={juntarClasses(
          'h-6 w-6 items-center justify-center rounded-total border-2',
          selecionado ? 'border-claro' : 'border-texto-fraco',
        )}
      >
        {selecionado ? <View className="h-3 w-3 rounded-total bg-claro" /> : null}
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Texto variante="titulo">{titulo}</Texto>
          {selo ? <Etiqueta texto={selo} tom="receita" alinhamento="inicio" /> : null}
        </View>
        <Texto variante="corpo-sm" cor="suave">
          {ajuda}
        </Texto>
      </View>
      <Texto variante="titulo">
        {valor}
        <Texto variante="corpo-sm" cor="suave">
          {periodo}
        </Texto>
      </Texto>
    </Pressable>
  );
}

function ConteudoPlanos({ precos, uso }: { precos: PlanosAVenda; uso: UsoPlano }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [escolhido, definirEscolhido] = useState<PlanoPago>('anual');
  const { etapa, erro, jaAssina, assinar } = useAssinar();
  const valor = (plano: PlanoPago) =>
    precos.planos.find((preco) => preco.plano === plano)?.valorCentavos ?? null;
  const anual = valor('anual');
  const mensal = valor('mensal');
  const beneficios = t('planos.venda.beneficios', { returnObjects: true });

  if (etapa === 'pago' || jaAssina) return <Redirect href="/mais/plano" />;

  const fechar = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="gap-5 pb-6 pt-2">
        <View className="flex-row items-center justify-between">
          <BotaoIcone icone="x" rotulo={t('planos.venda.fechar')} aoPressionar={fechar} />
          {uso.plano === 'teste' && uso.testeFim ? <SeloDoTeste testeFim={uso.testeFim} /> : null}
        </View>
        <Texto variante="titulo-xl" accessibilityRole="header">
          {t('planos.venda.titulo')}
        </Texto>
        <View className="gap-3" accessibilityRole="radiogroup">
          {anual !== null ? (
            <OpcaoPlano
              titulo={t('planos.venda.anual')}
              selo={t('planos.venda.melhorValor')}
              ajuda={t('planos.venda.equivale', {
                valor: formatarCentavos(Math.round(anual / 12)),
              })}
              valor={formatarCentavos(anual)}
              periodo={t('planos.venda.porAno')}
              selecionado={escolhido === 'anual'}
              aoEscolher={() => {
                definirEscolhido('anual');
              }}
            />
          ) : null}
          {mensal !== null ? (
            <OpcaoPlano
              titulo={t('planos.venda.mensal')}
              ajuda={t('planos.venda.canceleQuandoQuiser')}
              valor={formatarCentavos(mensal)}
              periodo={t('planos.venda.porMes')}
              selecionado={escolhido === 'mensal'}
              aoEscolher={() => {
                definirEscolhido('mensal');
              }}
            />
          ) : null}
        </View>
        <Card className="gap-3">
          <Texto variante="legenda" cor="suave" className="font-forte" accessibilityRole="header">
            {t('planos.venda.incluso').toUpperCase()}
          </Texto>
          {beneficios.map((beneficio) => (
            <View key={beneficio} className="flex-row items-center gap-3">
              <Icone nome="check" tamanho={18} cor={cores.receita} />
              <Texto className="flex-1 font-forte">{beneficio}</Texto>
            </View>
          ))}
        </Card>
      </ScrollView>
      <View className="gap-3 pb-4 pt-2">
        {etapa === 'confirmando' ? (
          <View
            className="flex-row items-center justify-center gap-2"
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={cores.texto} />
            <Texto>{t('planos.venda.confirmando')}</Texto>
          </View>
        ) : etapa === 'demorando' ? (
          <View className="gap-3" accessibilityLiveRegion="polite">
            <Texto className="text-center">{t('planos.venda.demorando')}</Texto>
            <Botao
              titulo={t('planos.venda.verSeuPlano')}
              larguraTotal
              aoPressionar={() => {
                router.replace('/mais/plano');
              }}
            />
          </View>
        ) : (
          <>
            {erro ? (
              <Texto
                variante="corpo-sm"
                cor="perigo"
                className="text-center"
                accessibilityLiveRegion="polite"
              >
                {t('planos.venda.erroCheckout')}
              </Texto>
            ) : null}
            <Botao
              titulo={
                escolhido === 'anual'
                  ? t('planos.venda.assinarAnual')
                  : t('planos.venda.assinarMensal')
              }
              larguraTotal
              carregando={etapa === 'abrindo'}
              desabilitado={valor(escolhido) === null}
              aoPressionar={() => {
                assinar(escolhido);
              }}
            />
            <Texto variante="legenda" cor="suave" className="text-center">
              {t('planos.venda.rodape')}
            </Texto>
            <Botao
              titulo={t('planos.venda.continuarGratuito')}
              variante="fantasma"
              aoPressionar={fechar}
            />
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Planos (`/planos`, T-103), como no design do cliente: anual (escolhido) e mensal com os preços de
 * `GET /planos`, o que os pagos liberam e o [Assinar], que abre o Stripe Checkout no navegador do
 * app. É onde o [Ver planos] leva (Mony, limites, relatórios, avisos do teste). Quem já assina vai
 * para "Seu plano", onde gerencia a assinatura.
 */
export default function TelaPlanos() {
  const { t } = useTranslation();
  const precos = usePlanosPlanos();
  const uso = usePlano();
  const pago = uso.data?.plano === 'mensal' || uso.data?.plano === 'anual';
  if (pago) return <Redirect href="/mais/plano" />;
  return (
    <Tela className="px-4 pt-2" bordas={['top', 'bottom']}>
      {precos.data && uso.data ? (
        <ConteudoPlanos precos={precos.data} uso={uso.data} />
      ) : precos.isError || uso.isError ? (
        <Erro
          mensagem={t('planos.venda.erro')}
          aoTentarDeNovo={() => {
            void precos.refetch();
            void uso.refetch();
          }}
        />
      ) : (
        <View className="gap-4 pt-16">
          <Skeleton altura={120} />
          <Skeleton altura={80} />
          <Skeleton altura={80} />
          <Skeleton altura={220} />
        </View>
      )}
    </Tela>
  );
}
