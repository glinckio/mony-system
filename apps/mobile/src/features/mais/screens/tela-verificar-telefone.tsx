import { esquemaVerificacaoTelefone, type Perfil } from '@mony/shared/usuario';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { mensagemDeErro } from '@/lib/formularios';
import { telefoneParaTexto } from '@/lib/nomes';
import { Botao, Cabecalho, Campo, Erro, RolagemFormulario, Skeleton, Tela, Texto } from '@/ui';

import { usePedirCodigoTelefone, usePerfil, useVerificarTelefone } from '../hooks/use-perfil';

function Verificacao({ perfil, aoTerminar }: { perfil: Perfil; aoTerminar: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pedir = usePedirCodigoTelefone();
  const verificar = useVerificarTelefone();
  const [enviado, definirEnviado] = useState(false);
  const [codigo, definirCodigo] = useState('');
  const [tentou, definirTentou] = useState(false);
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);

  if (perfil.telefone === null) {
    return (
      <View className="gap-4 pt-3">
        <Texto>{t('mais.verificarTelefone.semTelefone')}</Texto>
        <Botao
          titulo={t('mais.verificarTelefone.irParaDados')}
          larguraTotal
          aoPressionar={() => {
            router.push('/mais/dados-pessoais');
          }}
        />
      </View>
    );
  }

  if (perfil.telefoneVerificado) {
    return (
      <View className="gap-4 pt-3">
        <Texto>{t('mais.verificarTelefone.verificado')}</Texto>
      </View>
    );
  }

  const valido = esquemaVerificacaoTelefone.safeParse({ codigo }).success;

  async function enviar() {
    definirErroEnvio(null);
    try {
      await pedir.mutateAsync();
      definirEnviado(true);
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('mais.semConexao')));
    }
  }

  async function confirmar() {
    definirTentou(true);
    definirErroEnvio(null);
    if (!valido) return;
    try {
      await verificar.mutateAsync({ codigo });
      aoTerminar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('mais.semConexao')));
    }
  }

  return (
    <RolagemFormulario contentContainerClassName="gap-5 pb-8 pt-3">
      <Texto>
        {t('mais.verificarTelefone.texto', { telefone: telefoneParaTexto(perfil.telefone) })}
      </Texto>
      {enviado ? (
        <>
          <Texto variante="corpo-sm" cor="suave">
            {t('mais.verificarTelefone.enviado')}
          </Texto>
          <Campo
            rotulo={t('mais.verificarTelefone.codigo')}
            value={codigo}
            onChangeText={(texto) => {
              definirCodigo(texto.replace(/\D/g, '').slice(0, 6));
            }}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            erro={tentou && !valido ? t('mais.verificarTelefone.validacao') : null}
          />
        </>
      ) : null}
      {erroEnvio === null ? null : (
        <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {erroEnvio}
        </Texto>
      )}
      {enviado ? (
        <>
          <Botao
            titulo={t('mais.verificarTelefone.verificar')}
            larguraTotal
            carregando={verificar.isPending}
            aoPressionar={() => void confirmar()}
          />
          <Botao
            titulo={t('mais.verificarTelefone.reenviar')}
            variante="secundaria"
            larguraTotal
            carregando={pedir.isPending}
            aoPressionar={() => void enviar()}
          />
        </>
      ) : (
        <Botao
          titulo={t('mais.verificarTelefone.enviar')}
          larguraTotal
          carregando={pedir.isPending}
          aoPressionar={() => void enviar()}
        />
      )}
    </RolagemFormulario>
  );
}

/**
 * Verificar o celular (`/verificar-telefone`, RN-078, T-122b): o código de 6 dígitos por SMS
 * (`POST /me/telefone/codigo`) e a conferência (`POST /me/telefone/verificar`). Abre pelos dados
 * pessoais e pelo lembrete que pede ligação; ao verificar, volta para onde estava.
 */
export default function TelaVerificarTelefone() {
  const { t } = useTranslation();
  const router = useRouter();
  const perfil = usePerfil();

  function voltar() {
    if (router.canGoBack()) router.back();
    else router.replace('/mais/dados-pessoais');
  }

  return (
    <Tela degrade={false} className="px-4 pt-2">
      <View className="flex-1">
        <Cabecalho titulo={t('mais.verificarTelefone.titulo')} aoVoltar={voltar} />
        {perfil.data ? (
          <Verificacao perfil={perfil.data} aoTerminar={voltar} />
        ) : perfil.isError ? (
          <Erro aoTentarDeNovo={() => void perfil.refetch()} />
        ) : (
          <View className="gap-4 pt-3">
            <Skeleton altura={50} />
          </View>
        )}
      </View>
    </Tela>
  );
}
