import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, ScrollView, View } from 'react-native';

import {
  type AlarmeAgendado,
  type AlarmeLocal,
  alarmes,
  atrasoEmSegundos,
  type DisparoAlarme,
  type ModuloAlarmes,
  type PermissoesAlarme,
  type ResultadoSincronizacao,
  resumoDosDisparos,
  type TextosAlarme,
} from '@/lib/alarmes';
import { configApp } from '@/lib/config';
import { horaDoAparelho } from '@/lib/datas-texto';
import { relogio } from '@/lib/relogio';
import { Botao, Cabecalho, Card, Tela, Texto } from '@/ui';

/** O disparo acontece fora do JS: a tela relê o estado sozinha. */
const RELER_A_CADA_MS = 5_000;
const MAXIMO_NA_LISTA = 20;
const TESTES_EM_MINUTOS = [1, 5, 15] as const;
const MINUTO = 60_000;

type Permissao = keyof PermissoesAlarme;

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
 * Tela de teste da PoC do alarme no Android (T-023a). Só em desenvolvimento (Perfil → "Teste do
 * alarme"): agenda alarmes de teste e mede, no aparelho, o atraso entre o horário previsto e o toque.
 * Os lembretes de verdade são da T-084.
 */
export default function TelaPocAlarmes() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Tela className="px-4 pt-2">
      <Cabecalho
        titulo={t('alarmes.poc.titulo')}
        aoVoltar={() => {
          router.back();
        }}
      />
      {/* A rota existe em todo build; o painel, só em desenvolvimento. */}
      {alarmes && configApp.ambiente === 'development' ? (
        <Painel modulo={alarmes} />
      ) : (
        <Texto cor="suave">{t('alarmes.poc.indisponivel')}</Texto>
      )}
    </Tela>
  );
}

function Painel({ modulo }: { modulo: ModuloAlarmes }) {
  const { t } = useTranslation();
  const [permissoes, definirPermissoes] = useState<PermissoesAlarme | null>(null);
  const [agendados, definirAgendados] = useState<AlarmeAgendado[]>([]);
  const [disparos, definirDisparos] = useState<DisparoAlarme[]>([]);
  const [resultado, definirResultado] = useState<ResultadoSincronizacao | null>(null);
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);

  const textos: TextosAlarme = {
    canal: t('alarmes.nativo.canal'),
    parar: t('alarmes.nativo.parar'),
    adiar: t('alarmes.nativo.adiar'),
  };

  const reler = useCallback(async () => {
    try {
      const [liberadas, estado] = await Promise.all([modulo.permissoes(), modulo.estado()]);
      definirPermissoes(liberadas);
      definirAgendados(estado.alarmes);
      definirDisparos(estado.disparos);
    } catch (falha) {
      definirErro(textoDoErro(falha));
    }
  }, [modulo]);

  useEffect(() => {
    async function primeiraLeitura() {
      await reler();
    }
    void primeiraLeitura();
    // Relê ao voltar das configurações do sistema ou do toque do alarme, e de tempos em tempos.
    const intervalo = setInterval(() => void reler(), RELER_A_CADA_MS);
    const assinatura = AppState.addEventListener('change', (situacao) => {
      if (situacao === 'active') void reler();
    });
    return () => {
      clearInterval(intervalo);
      assinatura.remove();
    };
  }, [reler]);

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

  /** A sincronização troca a lista inteira: manda os de teste que já estão mais o novo. */
  async function sincronizar(lista: AlarmeLocal[]) {
    definirResultado(await modulo.sincronizar(lista, textos));
  }

  function agendarTeste(minutos: number) {
    const instante = relogio.agora().getTime() + minutos * MINUTO;
    const novo: AlarmeLocal = {
      id: `teste-${String(instante)}`,
      instante,
      titulo: t('alarmes.poc.tituloTeste'),
      corpo: t('alarmes.poc.corpoTeste', { hora: horaDoAparelho(instante, true) }),
    };
    const mantidos = agendados
      .filter((alarme) => !alarme.adiado)
      .map(({ id, instante: quando, titulo, corpo }) => ({ id, instante: quando, titulo, corpo }));
    void agir(() => sincronizar([...mantidos, novo]));
  }

  const abrir: Record<Permissao, () => Promise<void>> = {
    alarmeExato: () => modulo.abrirConfiguracaoAlarmeExato(),
    notificacoes: () => modulo.abrirConfiguracaoDeNotificacoes(),
    telaCheia: () => modulo.abrirConfiguracaoTelaCheia(),
  };
  const resumo = resumoDosDisparos(disparos);
  const ultimosDisparos = [...disparos].reverse().slice(0, MAXIMO_NA_LISTA);

  return (
    <ScrollView contentContainerClassName="gap-4 pb-6">
      <Texto variante="corpo-sm" cor="suave">
        {t('alarmes.poc.explicacao')}
      </Texto>
      {erro ? (
        <Texto variante="corpo-sm" cor="perigo">
          {t('alarmes.poc.erro', { mensagem: erro })}
        </Texto>
      ) : null}

      <Secao titulo={t('alarmes.poc.permissoes')}>
        {(['alarmeExato', 'notificacoes', 'telaCheia'] as const).map((permissao) => (
          <View key={permissao} className="flex-row items-center gap-3">
            <View className="flex-1">
              <Texto className="font-forte">{t(`alarmes.poc.${permissao}`)}</Texto>
              <Texto
                variante="legenda"
                cor={permissoes?.[permissao] === false ? 'atencao' : 'suave'}
              >
                {permissoes?.[permissao]
                  ? t('alarmes.poc.liberado')
                  : t(`alarmes.poc.${permissao}Ajuda`)}
              </Texto>
            </View>
            {permissoes?.[permissao] === false ? (
              <Botao
                compacto
                variante="secundaria"
                titulo={t('alarmes.poc.liberar')}
                rotulo={`${t('alarmes.poc.liberar')}: ${t(`alarmes.poc.${permissao}`)}`}
                aoPressionar={() => void agir(abrir[permissao])}
              />
            ) : null}
          </View>
        ))}
      </Secao>

      <Secao titulo={t('alarmes.poc.testar')}>
        <View className="flex-row flex-wrap gap-2">
          {TESTES_EM_MINUTOS.map((minutos) => (
            <Botao
              key={minutos}
              compacto
              titulo={t('alarmes.poc.tocarEm', { minutos })}
              desabilitado={ocupado}
              aoPressionar={() => {
                agendarTeste(minutos);
              }}
            />
          ))}
        </View>
        {resultado ? (
          <Texto variante="corpo-sm" cor={resultado.exato ? 'suave' : 'atencao'}>
            {t('alarmes.poc.resultado', {
              agendados: resultado.agendados,
              descartados: resultado.descartados,
              modo: resultado.exato ? t('alarmes.poc.exato') : t('alarmes.poc.inexato'),
            })}
          </Texto>
        ) : null}
        <Botao
          compacto
          variante="secundaria"
          titulo={t('alarmes.poc.cancelarTodos')}
          desabilitado={ocupado || agendados.length === 0}
          aoPressionar={() => void agir(() => sincronizar([]))}
        />
      </Secao>

      <Secao titulo={t('alarmes.poc.agendados')}>
        {agendados.length === 0 ? (
          <Texto variante="corpo-sm" cor="suave">
            {t('alarmes.poc.semAgendados')}
          </Texto>
        ) : (
          agendados.map((alarme) => (
            <Texto key={alarme.id} variante="corpo-sm">
              {t(alarme.adiado ? 'alarmes.poc.adiado' : 'alarmes.poc.agendado', {
                hora: horaDoAparelho(alarme.instante, true),
                titulo: alarme.titulo,
              })}
            </Texto>
          ))
        )}
      </Secao>

      <Secao titulo={t('alarmes.poc.disparos')}>
        {resumo ? (
          <Texto variante="corpo-sm" className="font-forte">
            {t('alarmes.poc.resumo', {
              quantidade: resumo.quantidade,
              exatos: resumo.exatos,
              mediana: resumo.medianaSeg,
              maior: resumo.maiorSeg,
            })}
          </Texto>
        ) : (
          <Texto variante="corpo-sm" cor="suave">
            {t('alarmes.poc.semDisparos')}
          </Texto>
        )}
        {ultimosDisparos.map((disparo) => (
          <Texto
            key={`${disparo.id}-${String(disparo.disparado)}`}
            variante="corpo-sm"
            cor={disparo.exato ? 'texto' : 'atencao'}
          >
            {t('alarmes.poc.disparo', {
              previsto: horaDoAparelho(disparo.previsto, true),
              disparado: horaDoAparelho(disparo.disparado, true),
              atraso: atrasoEmSegundos(disparo),
              modo: disparo.exato ? t('alarmes.poc.exato') : t('alarmes.poc.inexato'),
            })}
          </Texto>
        ))}
        {disparos.length > 0 ? (
          <Botao
            compacto
            variante="fantasma"
            titulo={t('alarmes.poc.limpar')}
            desabilitado={ocupado}
            aoPressionar={() => void agir(() => modulo.limparHistorico())}
          />
        ) : null}
      </Secao>
    </ScrollView>
  );
}
