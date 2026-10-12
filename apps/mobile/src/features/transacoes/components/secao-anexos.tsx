import { MAXIMO_ANEXOS_POR_TRANSACAO } from '@mony/shared/transacoes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native';

import { Botao, BotaoIcone, Icone, Texto } from '@/ui';
import { cores } from '@/ui/tokens';

import {
  type AnexoNaTela,
  enviarAnexo,
  escolherFoto,
  escolherPdf,
  FalhaAnexo,
  type MotivoFalhaAnexo,
  urlDoAnexo,
} from '../lib/anexos';
import { tamanhoParaTexto } from '../lib/tamanho';

type Erro = MotivoFalhaAnexo | 'abrir';

interface PropsSecaoAnexos {
  anexos: readonly AnexoNaTela[];
  aoMudar: (anexos: AnexoNaTela[]) => void;
}

/**
 * Anexos do lançamento (RN-040): foto da câmera ou da galeria (reduzida no aparelho) e PDF, até
 * cinco. Cada um vai direto ao S3 ao ser escolhido; o lançamento só fica com eles ao salvar.
 */
export function SecaoAnexos({ anexos, aoMudar }: PropsSecaoAnexos) {
  const { t } = useTranslation();
  const [enviando, definirEnviando] = useState(false);
  const [erro, definirErro] = useState<Erro | null>(null);
  const cheio = anexos.length >= MAXIMO_ANEXOS_POR_TRANSACAO;

  async function adicionar(escolher: () => ReturnType<typeof escolherPdf>) {
    definirErro(null);
    try {
      const arquivo = await escolher();
      if (arquivo === null) return;
      definirEnviando(true);
      const anexo = await enviarAnexo(arquivo);
      aoMudar([...anexos, anexo]);
    } catch (falha) {
      definirErro(falha instanceof FalhaAnexo ? falha.motivo : 'envio');
    } finally {
      definirEnviando(false);
    }
  }

  async function abrir(id: string) {
    definirErro(null);
    try {
      await Linking.openURL(await urlDoAnexo(id));
    } catch {
      definirErro('abrir');
    }
  }

  return (
    <View className="gap-2">
      <Texto variante="corpo-sm" cor="suave" className="font-medio">
        {t('transacoes.formulario.anexos.titulo', {
          quantidade: anexos.length,
          maximo: MAXIMO_ANEXOS_POR_TRANSACAO,
        })}
      </Texto>
      {anexos.map((anexo) => {
        const nome = t(
          anexo.tipo === 'pdf'
            ? 'transacoes.formulario.anexos.documento'
            : 'transacoes.formulario.anexos.foto',
          { tamanho: tamanhoParaTexto(anexo.tamanho) },
        );
        return (
          <View
            key={anexo.id}
            className="flex-row items-center gap-3 rounded-md bg-superficie-alta p-2"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('transacoes.formulario.anexos.abrir', { anexo: nome })}
              onPress={() => void abrir(anexo.id)}
              className="flex-1 flex-row items-center gap-3 active:opacity-70"
            >
              {anexo.uriLocal === undefined ? (
                <View className="h-10 w-10 items-center justify-center rounded-sm bg-vidro">
                  <Icone
                    nome={anexo.tipo === 'pdf' ? 'paperclip' : 'camera'}
                    tamanho={18}
                    cor={cores['texto-suave']}
                  />
                </View>
              ) : (
                <Image
                  source={{ uri: anexo.uriLocal }}
                  accessibilityIgnoresInvertColors
                  className="h-10 w-10 rounded-sm"
                />
              )}
              <Texto className="flex-1">{nome}</Texto>
            </Pressable>
            <BotaoIcone
              icone="x"
              rotulo={t('transacoes.formulario.anexos.tirar', { anexo: nome })}
              aoPressionar={() => {
                aoMudar(anexos.filter(({ id }) => id !== anexo.id));
              }}
            />
          </View>
        );
      })}
      {enviando ? (
        <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
          <ActivityIndicator color={cores.texto} />
          <Texto cor="suave">{t('transacoes.formulario.anexos.enviando')}</Texto>
        </View>
      ) : cheio ? null : (
        <View className="flex-row flex-wrap gap-2">
          <Botao
            variante="secundaria"
            compacto
            icone="camera"
            titulo={t('transacoes.formulario.anexos.camera')}
            aoPressionar={() => void adicionar(() => escolherFoto('camera'))}
          />
          <Botao
            variante="secundaria"
            compacto
            icone="scan-text"
            titulo={t('transacoes.formulario.anexos.galeria')}
            aoPressionar={() => void adicionar(() => escolherFoto('galeria'))}
          />
          <Botao
            variante="secundaria"
            compacto
            icone="paperclip"
            titulo={t('transacoes.formulario.anexos.pdf')}
            aoPressionar={() => void adicionar(escolherPdf)}
          />
        </View>
      )}
      {erro === null ? (
        <Texto variante="legenda" cor="suave">
          {t('transacoes.formulario.anexos.ajuda')}
        </Texto>
      ) : (
        <Texto variante="corpo-sm" cor="perigo" accessibilityRole="alert">
          {t(`transacoes.formulario.anexos.erros.${erro}`)}
        </Texto>
      )}
    </View>
  );
}
