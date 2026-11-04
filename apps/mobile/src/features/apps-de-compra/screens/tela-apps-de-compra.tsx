import type { ListaAppsMonitorados } from '@mony/shared/apps-compra';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, ScrollView, Switch, View } from 'react-native';

import { exigePlanoPago, mensagemDeErro } from '@/lib/formularios';
import {
  type AppDoAparelho,
  appsParaEscolher,
  listaParaSalvar,
  type ModuloUsoDeApps,
  usoDeApps,
} from '@/lib/uso-de-apps';
import {
  Botao,
  Cabecalho,
  CaixaDeSelecao,
  CampoBusca,
  Card,
  Erro,
  Skeleton,
  Tela,
  Texto,
} from '@/ui';
import { cores } from '@/ui/tokens';

import {
  useAparelho,
  useAppsInstalados,
  useAppsMonitorados,
  useDesligarAppsDeCompra,
  useLigarAppsDeCompra,
  useRelerAparelho,
  useSalvarAppsMonitorados,
} from '../hooks/use-apps-de-compra';

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Texto variante="legenda" cor="suave" className="font-forte" accessibilityRole="header">
        {titulo.toUpperCase()}
      </Texto>
      <Card className="gap-3">{children}</Card>
    </View>
  );
}

/**
 * Apps de compra (T-121b, doc 04 e doc 10): a pessoa liga o aviso, libera o acesso ao uso e escolhe
 * os apps. Quando um deles é aberto, o worker do Android manda a abertura ao servidor, que aplica a
 * RN-104 e manda o push com o orçamento de compras. Recurso pago (RN-121). Só no Android por
 * enquanto; o iPhone é a T-121c.
 */
export default function TelaAppsDeCompra() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Tela degrade={false} className="px-4 pt-2">
      <Cabecalho
        titulo={t('appsDeCompra.titulo')}
        aoVoltar={() => {
          router.back();
        }}
      />
      {usoDeApps ? (
        <Conteudo modulo={usoDeApps} />
      ) : (
        <Texto cor="suave" className="pt-3">
          {t('appsDeCompra.indisponivel')}
        </Texto>
      )}
    </Tela>
  );
}

function Conteudo({ modulo }: { modulo: ModuloUsoDeApps }) {
  const lista = useAppsMonitorados();
  const aparelho = useAparelho(modulo);
  const instalados = useAppsInstalados(modulo);
  const reler = useRelerAparelho();

  // A pessoa volta das configurações do sistema (acesso ao uso) com o app em primeiro plano.
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void reler();
    });
    return () => {
      assinatura.remove();
    };
  }, [reler]);

  if (lista.isError || aparelho.isError) {
    return (
      <Erro
        aoTentarDeNovo={() => {
          void lista.refetch();
          void aparelho.refetch();
        }}
      />
    );
  }
  if (!lista.data || !aparelho.data) {
    return (
      <View className="gap-4 pt-3">
        <Skeleton altura={140} />
        <Skeleton altura={320} />
      </View>
    );
  }
  return (
    <Formulario
      modulo={modulo}
      lista={lista.data}
      aparelho={aparelho.data}
      instalados={instalados.data ?? null}
    />
  );
}

interface PropsFormulario {
  modulo: ModuloUsoDeApps;
  lista: ListaAppsMonitorados;
  aparelho: NonNullable<ReturnType<typeof useAparelho>['data']>;
  instalados: AppDoAparelho[] | null;
}

function Formulario({ modulo, lista, aparelho, instalados }: PropsFormulario) {
  const { t } = useTranslation();
  const router = useRouter();
  const ligar = useLigarAppsDeCompra(modulo);
  const desligar = useDesligarAppsDeCompra(modulo);
  const salvar = useSalvarAppsMonitorados(modulo);
  const escolhas = useMemo(
    () => appsParaEscolher(lista.itens, instalados ?? []),
    [lista.itens, instalados],
  );
  const [marcados, definirMarcados] = useState<ReadonlySet<string> | null>(null);
  const [busca, definirBusca] = useState('');
  const [mensagem, definirMensagem] = useState<{ texto: string; erro: boolean } | null>(null);

  const marcadosAgora =
    marcados ?? new Set(escolhas.filter((app) => app.marcado).map((app) => app.pacote));
  const mudou = marcados !== null;
  const ligado = aparelho.envio === 'ligado';
  const ocupado = ligar.isPending || desligar.isPending || salvar.isPending;
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const visiveis = termo
    ? escolhas.filter((app) => app.nome.toLocaleLowerCase('pt-BR').includes(termo))
    : escolhas;

  function marcar(pacote: string, marcada: boolean) {
    const novos = new Set(marcadosAgora);
    if (marcada) novos.add(pacote);
    else novos.delete(pacote);
    definirMarcados(novos);
    definirMensagem(null);
  }

  /** Salva a lista quando mudou; devolve a lista do servidor depois da troca. */
  async function salvarSeMudou(): Promise<ListaAppsMonitorados> {
    if (!mudou) return lista;
    const nova = await salvar.mutateAsync(
      listaParaSalvar(lista.itens, instalados ?? [], marcadosAgora),
    );
    definirMarcados(null);
    return nova;
  }

  async function mudarAviso(valor: boolean) {
    definirMensagem(null);
    try {
      if (!valor) {
        await desligar.mutateAsync();
        return;
      }
      if (marcadosAgora.size === 0) {
        definirMensagem({ texto: t('appsDeCompra.escolhaUm'), erro: true });
        return;
      }
      await ligar.mutateAsync(await salvarSeMudou());
      definirMensagem({ texto: t('appsDeCompra.ligado'), erro: false });
    } catch (falha) {
      definirMensagem({
        texto: exigePlanoPago(falha)
          ? t('appsDeCompra.soPago')
          : mensagemDeErro(falha, t('appsDeCompra.erro')),
        erro: true,
      });
    }
  }

  async function salvarLista() {
    definirMensagem(null);
    try {
      await salvarSeMudou();
      definirMensagem({ texto: t('appsDeCompra.salvo'), erro: false });
    } catch (falha) {
      definirMensagem({ texto: mensagemDeErro(falha, t('appsDeCompra.erro')), erro: true });
    }
  }

  return (
    <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
      <Texto variante="corpo-sm" cor="suave">
        {t('appsDeCompra.explicacao')}
      </Texto>

      {!lista.disponivel ? (
        <Secao titulo={t('appsDeCompra.planoTitulo')}>
          <Texto>{t('appsDeCompra.planoTexto')}</Texto>
          <Botao
            titulo={t('appsDeCompra.verPlanos')}
            aoPressionar={() => {
              router.push('/planos');
            }}
          />
        </Secao>
      ) : (
        <>
          <Secao titulo={t('appsDeCompra.acesso')}>
            {aparelho.acessoAoUso ? (
              <Texto>{t('appsDeCompra.acessoLiberado')}</Texto>
            ) : (
              <>
                <Texto>{t('appsDeCompra.acessoExplicacao')}</Texto>
                <Botao
                  variante="secundaria"
                  titulo={t('appsDeCompra.abrirAcesso')}
                  aoPressionar={() => void modulo.abrirConfiguracaoDoAcesso()}
                />
              </>
            )}
          </Secao>

          <Secao titulo={t('appsDeCompra.aviso')}>
            <View className="flex-row items-center gap-3">
              <Texto className="flex-1">{t('appsDeCompra.avisoRotulo')}</Texto>
              <Switch
                accessibilityLabel={t('appsDeCompra.avisoRotulo')}
                value={ligado}
                disabled={ocupado || (!ligado && !aparelho.acessoAoUso)}
                accessibilityState={{ disabled: ocupado || (!ligado && !aparelho.acessoAoUso) }}
                onValueChange={(valor) => void mudarAviso(valor)}
                trackColor={{ true: cores.primaria, false: cores.borda }}
              />
            </View>
            {aparelho.envio === 'recusado' ? (
              <Texto variante="corpo-sm" cor="atencao">
                {t('appsDeCompra.recusado')}
              </Texto>
            ) : null}
            {ligado ? (
              <Texto variante="corpo-sm" cor="suave">
                {t('appsDeCompra.comoFunciona', { minutos: aparelho.intervaloMinutos })}
              </Texto>
            ) : null}
            {ligado && aparelho.pendentes > 0 ? (
              <Texto variante="corpo-sm" cor="suave">
                {t('appsDeCompra.pendentes', { count: aparelho.pendentes })}
              </Texto>
            ) : null}
          </Secao>
        </>
      )}

      <Secao titulo={t('appsDeCompra.apps')}>
        <View className="flex-row">
          <CampoBusca rotulo={t('appsDeCompra.buscar')} valor={busca} aoMudar={definirBusca} />
        </View>
        <Texto variante="corpo-sm" cor="suave">
          {t('appsDeCompra.marcados', { count: marcadosAgora.size })}
        </Texto>
        {instalados === null ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('appsDeCompra.carregandoApps')}
          </Texto>
        ) : visiveis.length === 0 ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('appsDeCompra.semApps')}
          </Texto>
        ) : (
          visiveis.map((app) => (
            <CaixaDeSelecao
              key={app.pacote}
              rotulo={app.nome}
              marcada={marcadosAgora.has(app.pacote)}
              aoMudar={(marcada) => {
                marcar(app.pacote, marcada);
              }}
            />
          ))
        )}
        {mudou ? (
          <Botao
            titulo={t('appsDeCompra.salvar')}
            carregando={salvar.isPending}
            desabilitado={ocupado}
            aoPressionar={() => void salvarLista()}
          />
        ) : null}
      </Secao>

      {mensagem ? (
        <Texto
          variante="corpo-sm"
          cor={mensagem.erro ? 'perigo' : 'receita'}
          accessibilityLiveRegion="polite"
        >
          {mensagem.texto}
        </Texto>
      ) : null}
    </ScrollView>
  );
}
