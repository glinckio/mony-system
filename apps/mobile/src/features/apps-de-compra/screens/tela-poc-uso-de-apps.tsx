import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, ScrollView, View } from 'react-native';

import { configApp } from '@/lib/config';
import {
  type AppDoAparelho,
  atrasoEmMinutos,
  type EstadoUsoDeApps,
  type ExecucaoVerificacao,
  horaDoAparelho,
  intervalosEntreVerificacoes,
  type ModuloUsoDeApps,
  resumoDosAtrasos,
  usoDeApps,
} from '@/lib/uso-de-apps';
import { Botao, Cabecalho, CaixaDeSelecao, CampoBusca, Card, Tela, Texto } from '@/ui';

/** A verificação roda no WorkManager, fora do JS: a tela relê o estado sozinha. */
const RELER_A_CADA_MS = 5_000;
/** Itens mais recentes mostrados em cada histórico. */
const MAXIMO_NA_LISTA = 20;

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

function textoDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/**
 * Tela de teste da PoC da detecção de apps de compra no Android (T-022). Só aparece no ambiente de
 * desenvolvimento (Perfil → "Teste da detecção de apps"); mede no aparelho o atraso entre abrir um
 * app e a verificação periódica achar a abertura. A tela do produto é da T-121.
 */
export default function TelaPocUsoDeApps() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Tela className="px-4 pt-2">
      <Cabecalho
        titulo={t('appsDeCompra.poc.titulo')}
        aoVoltar={() => {
          router.back();
        }}
      />
      {/* A rota existe em todo build; o painel, só em desenvolvimento. */}
      {usoDeApps && configApp.ambiente === 'development' ? (
        <Painel modulo={usoDeApps} />
      ) : (
        <Texto cor="suave">{t('appsDeCompra.poc.indisponivel')}</Texto>
      )}
    </Tela>
  );
}

function Painel({ modulo }: { modulo: ModuloUsoDeApps }) {
  const { t } = useTranslation();
  const [acesso, definirAcesso] = useState<boolean | null>(null);
  const [notificacoes, definirNotificacoes] = useState<boolean | null>(null);
  const [estado, definirEstado] = useState<EstadoUsoDeApps | null>(null);
  const [apps, definirApps] = useState<AppDoAparelho[] | null>(null);
  const [selecionados, definirSelecionados] = useState<ReadonlySet<string>>(() => new Set());
  const [busca, definirBusca] = useState('');
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);

  const reler = useCallback(async (): Promise<EstadoUsoDeApps | null> => {
    try {
      const [liberado, ligadas, atual] = await Promise.all([
        modulo.acessoAoUsoLiberado(),
        modulo.notificacoesLigadas(),
        modulo.estado(),
      ]);
      definirAcesso(liberado);
      definirNotificacoes(ligadas);
      definirEstado(atual);
      return atual;
    } catch (falha) {
      definirErro(textoDoErro(falha));
      return null;
    }
  }, [modulo]);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const atual = await reler();
      try {
        const lista = await modulo.listarApps();
        if (!ativo) return;
        definirApps(lista);
        // A seleção começa com a lista que o módulo já monitora.
        if (atual) definirSelecionados(new Set(atual.pacotes));
      } catch (falha) {
        if (ativo) definirErro(textoDoErro(falha));
      }
    }
    void carregar();
    // Relê ao voltar das configurações do sistema e de tempos em tempos.
    const intervalo = setInterval(() => void reler(), RELER_A_CADA_MS);
    const assinatura = AppState.addEventListener('change', (situacao) => {
      if (situacao === 'active') void reler();
    });
    return () => {
      ativo = false;
      clearInterval(intervalo);
      assinatura.remove();
    };
  }, [modulo, reler]);

  async function agir(acao: () => Promise<void>) {
    definirOcupado(true);
    definirErro(null);
    try {
      await acao();
      await reler();
    } catch (falha) {
      definirErro(textoDoErro(falha));
    } finally {
      definirOcupado(false);
    }
  }

  function marcar(pacote: string, marcado: boolean) {
    definirSelecionados((atuais) => {
      const novos = new Set(atuais);
      if (marcado) novos.add(pacote);
      else novos.delete(pacote);
      return novos;
    });
  }

  const termo = busca.trim().toLowerCase();
  const appsVisiveis = (apps ?? []).filter(
    (app) => termo === '' || app.nome.toLowerCase().includes(termo) || app.pacote.includes(termo),
  );
  const monitorando = estado?.monitorando ?? false;
  const resumo = resumoDosAtrasos(estado?.deteccoes ?? []);
  const intervalos = intervalosEntreVerificacoes(estado?.execucoes ?? []);
  const deteccoes = [...(estado?.deteccoes ?? [])].reverse().slice(0, MAXIMO_NA_LISTA);
  const execucoes = [...(estado?.execucoes ?? [])].reverse().slice(0, MAXIMO_NA_LISTA);

  function textoDaExecucao(execucao: ExecucaoVerificacao): string {
    const dados = {
      hora: horaDoAparelho(execucao.inicioEm),
      origem: t(`appsDeCompra.poc.${execucao.origem === 'manual' ? 'manual' : 'periodica'}`),
    };
    if (execucao.erro !== null)
      return t('appsDeCompra.poc.execucaoErro', { ...dados, erro: execucao.erro });
    if (!execucao.acessoAoUso) return t('appsDeCompra.poc.execucaoSemAcesso', dados);
    return t('appsDeCompra.poc.execucao', {
      ...dados,
      eventos: execucao.eventos,
      aberturas: execucao.aberturas,
    });
  }

  return (
    <ScrollView contentContainerClassName="gap-4 pb-6">
      <Texto variante="corpo-sm" cor="suave">
        {t('appsDeCompra.poc.explicacao', { minutos: estado?.intervaloMinutos ?? 15 })}
      </Texto>
      {erro ? (
        <Texto variante="corpo-sm" cor="perigo">
          {t('appsDeCompra.poc.erro', { mensagem: erro })}
        </Texto>
      ) : null}

      <Secao titulo={t('appsDeCompra.poc.acesso')}>
        <Texto cor={acesso === false ? 'atencao' : 'texto'}>
          {acesso ? t('appsDeCompra.poc.acessoLiberado') : t('appsDeCompra.poc.acessoNegado')}
        </Texto>
        {acesso === false ? (
          <Botao
            variante="secundaria"
            titulo={t('appsDeCompra.poc.abrirAcesso')}
            aoPressionar={() => void agir(() => modulo.abrirConfiguracaoDoAcesso())}
          />
        ) : null}
      </Secao>

      <Secao titulo={t('appsDeCompra.poc.notificacoes')}>
        <Texto>
          {notificacoes
            ? t('appsDeCompra.poc.notificacoesLigadas')
            : t('appsDeCompra.poc.notificacoesDesligadas')}
        </Texto>
        {notificacoes === false ? (
          <Botao
            variante="secundaria"
            titulo={t('appsDeCompra.poc.abrirNotificacoes')}
            aoPressionar={() => void agir(() => modulo.abrirConfiguracaoDeNotificacoes())}
          />
        ) : null}
      </Secao>

      <Secao titulo={t('appsDeCompra.poc.apps')}>
        <View className="flex-row">
          <CampoBusca
            rotulo={t('appsDeCompra.poc.buscarApp')}
            valor={busca}
            aoMudar={definirBusca}
          />
        </View>
        <Texto variante="corpo-sm" cor="suave">
          {selecionados.size === 1
            ? t('appsDeCompra.poc.selecionadosUm')
            : t('appsDeCompra.poc.selecionados', { quantidade: selecionados.size })}
        </Texto>
        {apps === null ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('appsDeCompra.poc.carregandoApps')}
          </Texto>
        ) : appsVisiveis.length === 0 ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('appsDeCompra.poc.semApps')}
          </Texto>
        ) : (
          appsVisiveis.map((app) => (
            <CaixaDeSelecao
              key={app.pacote}
              rotulo={app.nome}
              marcada={selecionados.has(app.pacote)}
              aoMudar={(marcada) => {
                marcar(app.pacote, marcada);
              }}
            />
          ))
        )}
        <Botao
          titulo={
            monitorando ? t('appsDeCompra.poc.atualizarLista') : t('appsDeCompra.poc.iniciar')
          }
          desabilitado={selecionados.size === 0}
          carregando={ocupado}
          aoPressionar={() => void agir(() => modulo.iniciar([...selecionados]))}
        />
      </Secao>

      <Secao titulo={t('appsDeCompra.poc.situacao')}>
        <Texto className="font-forte">
          {monitorando ? t('appsDeCompra.poc.monitorando') : t('appsDeCompra.poc.parado')}
        </Texto>
        {estado?.ultimaVerificacaoEm ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('appsDeCompra.poc.ultimaVerificacao', {
              hora: horaDoAparelho(estado.ultimaVerificacaoEm),
            })}
          </Texto>
        ) : null}
        {estado?.proximaVerificacaoEm ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('appsDeCompra.poc.proximaVerificacao', {
              hora: horaDoAparelho(estado.proximaVerificacaoEm),
            })}
          </Texto>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <Botao
            compacto
            variante="secundaria"
            titulo={t('appsDeCompra.poc.verificarAgora')}
            desabilitado={ocupado || (estado?.pacotes.length ?? 0) === 0}
            aoPressionar={() => void agir(() => modulo.verificarAgora())}
          />
          {monitorando ? (
            <Botao
              compacto
              variante="secundaria"
              titulo={t('appsDeCompra.poc.parar')}
              desabilitado={ocupado}
              aoPressionar={() => void agir(() => modulo.parar())}
            />
          ) : null}
          <Botao
            compacto
            variante="fantasma"
            titulo={t('appsDeCompra.poc.limpar')}
            desabilitado={ocupado}
            aoPressionar={() => void agir(() => modulo.limparHistorico())}
          />
        </View>
      </Secao>

      <Secao titulo={t('appsDeCompra.poc.deteccoes')}>
        {resumo ? (
          <Texto variante="corpo-sm" className="font-forte">
            {t('appsDeCompra.poc.resumo', {
              quantidade: resumo.quantidade,
              mediana: resumo.medianaMin,
              maior: resumo.maiorMin,
            })}
          </Texto>
        ) : (
          <Texto variante="corpo-sm" cor="suave">
            {t('appsDeCompra.poc.semDeteccoes')}
          </Texto>
        )}
        {deteccoes.map((deteccao) => (
          <View key={`${deteccao.pacote}-${String(deteccao.abertoEm)}`}>
            <Texto className="font-forte">{deteccao.nome}</Texto>
            <Texto variante="corpo-sm" cor="suave">
              {t('appsDeCompra.poc.deteccao', {
                aberto: horaDoAparelho(deteccao.abertoEm),
                visto: horaDoAparelho(deteccao.detectadoEm),
                atraso: atrasoEmMinutos(deteccao),
              })}
            </Texto>
          </View>
        ))}
      </Secao>

      <Secao titulo={t('appsDeCompra.poc.execucoes')}>
        {intervalos.length > 0 ? (
          <Texto variante="corpo-sm">
            {t('appsDeCompra.poc.intervalos', { intervalos: intervalos.join(', ') })}
          </Texto>
        ) : null}
        {execucoes.length === 0 ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('appsDeCompra.poc.semExecucoes')}
          </Texto>
        ) : (
          execucoes.map((execucao) => (
            <Texto
              key={`${execucao.origem}-${String(execucao.inicioEm)}`}
              variante="corpo-sm"
              cor={execucao.erro !== null || !execucao.acessoAoUso ? 'atencao' : 'texto'}
            >
              {textoDaExecucao(execucao)}
            </Texto>
          ))
        )}
      </Secao>
    </ScrollView>
  );
}
