import type { TipoAlerta } from '@mony/shared/enums';
import {
  type DadosAtualizacaoPreferenciasAlerta,
  type PreferenciasAlerta,
  REGEX_HORA,
} from '@mony/shared/notificacoes';
import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import {
  usePreferenciasAlerta,
  useSalvarPreferenciasAlerta,
} from '@/features/notificacoes/hooks/use-notificacoes';
import { mascararHora } from '@/lib/mascaras';
import { mensagemDeErro } from '@/lib/formularios';
import { Botao, Cabecalho, Campo, Card, Chip, Erro, Skeleton, Tela, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

/**
 * Os alertas que o app já manda, na ordem da tela; os de recursos que ainda não existem (lembretes,
 * agenda, apps de compra, banco) entram com eles.
 */
const TIPOS_NA_TELA: readonly TipoAlerta[] = [
  'limite_cartao',
  'fatura_fechada',
  'fatura_vencimento',
  'fatura_atrasada',
  'orcamento',
  'vencimento_pendente',
  'gasto_fora_padrao',
  'projecao_mes',
  'resumo_periodo',
  'assinatura',
];

/** RN-108: dias de antecedência oferecidos nos avisos de vencimento. */
const ANTECEDENCIAS = [0, 1, 3, 5, 7] as const;

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

function FormularioAlertas({ preferencias }: { preferencias: PreferenciasAlerta }) {
  const { t } = useTranslation();
  const salvar = useSalvarPreferenciasAlerta();
  const doTipo = new Map(preferencias.tipos.map((tipo) => [tipo.tipo, tipo]));
  const [ativos, definirAtivos] = useState<Partial<Record<TipoAlerta, boolean>>>(() =>
    Object.fromEntries(preferencias.tipos.map(({ tipo, ativo }) => [tipo, ativo])),
  );
  const [antecedencias, definirAntecedencias] = useState<Partial<Record<TipoAlerta, number>>>(() =>
    Object.fromEntries(
      preferencias.tipos.flatMap(({ tipo, antecedenciaDias }) =>
        antecedenciaDias === null ? [] : [[tipo, antecedenciaDias]],
      ),
    ),
  );
  const [comSilencio, definirComSilencio] = useState(preferencias.silencio !== null);
  const [inicio, definirInicio] = useState(preferencias.silencio?.inicio ?? '22:00');
  const [fim, definirFim] = useState(preferencias.silencio?.fim ?? '07:00');
  const [mensagem, definirMensagem] = useState<{ texto: string; erro: boolean } | null>(null);

  const horaInvalida = comSilencio && (!REGEX_HORA.test(inicio) || !REGEX_HORA.test(fim));
  const horasIguais = comSilencio && !horaInvalida && inicio === fim;

  /** Só o que mudou, como o `PUT /preferencias-alerta` aceita. */
  function mudancas(): DadosAtualizacaoPreferenciasAlerta {
    const silencioAntes = preferencias.silencio;
    const silencio = comSilencio ? { inicio, fim } : null;
    const silencioMudou =
      (silencio === null) !== (silencioAntes === null) ||
      (silencio !== null &&
        (silencio.inicio !== silencioAntes?.inicio || silencio.fim !== silencioAntes.fim));
    const tipos = preferencias.tipos.flatMap(({ tipo, ativo, antecedenciaDias }) => {
      const novoAtivo = ativos[tipo] ?? ativo;
      const novaAntecedencia = antecedencias[tipo] ?? antecedenciaDias;
      if (novoAtivo === ativo && novaAntecedencia === antecedenciaDias) return [];
      return [
        {
          tipo,
          ...(novoAtivo === ativo ? {} : { ativo: novoAtivo }),
          ...(novaAntecedencia === antecedenciaDias ? {} : { antecedenciaDias: novaAntecedencia }),
        },
      ];
    });
    return {
      ...(silencioMudou ? { silencio } : {}),
      ...(tipos.length > 0 ? { tipos } : {}),
    };
  }

  async function enviar() {
    definirMensagem(null);
    if (horaInvalida || horasIguais) return;
    const dados = mudancas();
    try {
      if (Object.keys(dados).length > 0) await salvar.mutateAsync(dados);
      definirMensagem({ texto: t('notificacoes.alertas.salvo'), erro: false });
    } catch (falha) {
      definirMensagem({
        texto: mensagemDeErro(falha, t('notificacoes.alertas.erroSalvar')),
        erro: true,
      });
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
        <Secao titulo={t('notificacoes.alertas.silencio')}>
          <View className="flex-row items-center gap-3">
            <Texto variante="corpo-sm" cor="suave" className="flex-1">
              {t('notificacoes.alertas.silencioAjuda')}
            </Texto>
            <Switch
              accessibilityLabel={t('notificacoes.alertas.silencio')}
              value={comSilencio}
              onValueChange={definirComSilencio}
              trackColor={{ true: cores.primaria, false: cores.borda }}
            />
          </View>
          {comSilencio ? (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Campo
                  rotulo={t('notificacoes.alertas.inicio')}
                  value={inicio}
                  onChangeText={(texto) => {
                    definirInicio(mascararHora(texto));
                  }}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
              <View className="flex-1">
                <Campo
                  rotulo={t('notificacoes.alertas.fim')}
                  value={fim}
                  onChangeText={(texto) => {
                    definirFim(mascararHora(texto));
                  }}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </View>
          ) : null}
          {horaInvalida ? (
            <Texto variante="corpo-sm" cor="perigo" accessibilityLiveRegion="polite">
              {t('notificacoes.alertas.erroHora')}
            </Texto>
          ) : horasIguais ? (
            <Texto variante="corpo-sm" cor="perigo" accessibilityLiveRegion="polite">
              {t('notificacoes.alertas.erroIguais')}
            </Texto>
          ) : null}
        </Secao>

        <Secao titulo={t('notificacoes.alertas.tipos')}>
          {TIPOS_NA_TELA.flatMap((tipo) => {
            const preferencia = doTipo.get(tipo);
            if (!preferencia) return [];
            const nome = t(`notificacoes.tipos.${tipo}`);
            const ativo = ativos[tipo] ?? preferencia.ativo;
            const antecedencia = antecedencias[tipo] ?? preferencia.antecedenciaDias;
            return [
              <View key={tipo} className="gap-2">
                <View className="min-h-toque flex-row items-center gap-3">
                  <View className="flex-1">
                    <Texto className="font-forte">{nome}</Texto>
                    {preferencia.desligavel ? null : (
                      <Texto variante="legenda" cor="suave">
                        {t('notificacoes.alertas.sempre')}
                      </Texto>
                    )}
                  </View>
                  <Switch
                    accessibilityLabel={nome}
                    value={ativo}
                    disabled={!preferencia.desligavel}
                    accessibilityState={{ disabled: !preferencia.desligavel }}
                    onValueChange={(valor) => {
                      definirAtivos((atuais) => ({ ...atuais, [tipo]: valor }));
                    }}
                    trackColor={{ true: cores.primaria, false: cores.borda }}
                  />
                </View>
                {ativo && antecedencia !== null ? (
                  <View className="flex-row flex-wrap gap-2">
                    {ANTECEDENCIAS.map((dias) => (
                      <Chip
                        key={dias}
                        rotulo={
                          dias === 0
                            ? t('notificacoes.alertas.noDia')
                            : t('notificacoes.alertas.dias', { count: dias })
                        }
                        selecionado={antecedencia === dias}
                        aoPressionar={() => {
                          definirAntecedencias((atuais) => ({ ...atuais, [tipo]: dias }));
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </View>,
            ];
          })}
        </Secao>

        {mensagem ? (
          <Texto
            cor={mensagem.erro ? 'perigo' : 'suave'}
            accessibilityRole={mensagem.erro ? 'alert' : 'text'}
            accessibilityLiveRegion="polite"
          >
            {mensagem.texto}
          </Texto>
        ) : null}
        <Botao
          titulo={t('notificacoes.alertas.salvar')}
          larguraTotal
          carregando={salvar.isPending}
          desabilitado={horaInvalida || horasIguais}
          aoPressionar={() => void enviar()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Alertas da Mony (`/mais/alertas`, T-087): o que avisar (RN-100; assinatura sempre ligada), a
 * antecedência dos vencimentos (RN-108) e o horário de silêncio (RN-101).
 */
export default function TelaAlertas() {
  const { t } = useTranslation();
  const router = useRouter();
  const preferencias = usePreferenciasAlerta();
  return (
    <Tela degrade={false} className="px-4 pt-2">
      <Cabecalho
        titulo={t('notificacoes.alertas.titulo')}
        aoVoltar={() => {
          router.dismissTo('/mais/perfil');
        }}
      />
      {preferencias.data ? (
        <FormularioAlertas preferencias={preferencias.data} />
      ) : preferencias.isError ? (
        <Erro aoTentarDeNovo={() => void preferencias.refetch()} />
      ) : (
        <View className="gap-4 pt-3">
          <Skeleton altura={120} />
          <Skeleton altura={300} />
        </View>
      )}
    </Tela>
  );
}
