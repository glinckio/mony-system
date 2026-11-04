import { zodResolver } from '@hookform/resolvers/zod';
import { entrarAutenticacao } from '@mony/api-client';
import { esquemaLogin } from '@mony/shared/autenticacao';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { dadosDoAparelho } from '@/lib/auth/aparelho';
import { comecarSessao } from '@/lib/auth/sessao';
import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { Botao, Texto } from '@/ui';

import { BotaoGoogle } from '../components/botao-google';
import { loginGooglePendente, vincularGooglePendente } from '../login-google';
import { ErroDoFormulario, TelaFormulario } from './tela-formulario';

const esquemaFormulario = esquemaLogin.pick({ email: true, senha: true });

/**
 * Login com e-mail e senha ou com o Google (RN-002, T-055a; a Apple entra na T-055b). Quando o
 * e-mail do Google já tem conta, a pessoa entra com a senha uma vez e o Google é ligado à conta.
 */
export default function TelaLogin() {
  const { t } = useTranslation();
  const router = useRouter();
  const [erro, definirErro] = useState<string | null>(null);
  const [vinculo, definirVinculo] = useState<string | null>(null);
  const formulario = useForm({
    resolver: zodResolver(esquemaFormulario),
    defaultValues: { email: '', senha: '' },
  });

  const pedirSenha = useCallback(
    (email: string | null) => {
      if (email) formulario.setValue('email', email);
      definirVinculo(t('auth.google.vinculo', { email: email ?? '' }));
    },
    [formulario, t],
  );

  // O Google pode ter pedido a senha na tela de cadastro, que volta para cá.
  useFocusEffect(
    useCallback(() => {
      const pendente = loginGooglePendente();
      if (pendente?.motivo === 'vinculo') pedirSenha(pendente.email);
    }, [pedirSenha]),
  );

  const entrar = formulario.handleSubmit(async (dados) => {
    definirErro(null);
    try {
      const sessao = await entrarAutenticacao({ ...dados, dispositivo: await dadosDoAparelho() });
      await comecarSessao(sessao);
      await vincularGooglePendente();
    } catch (falha) {
      definirErro(mensagemDeErro(falha, t('auth.semConexao')));
    }
  });

  return (
    <TelaFormulario
      titulo={t('auth.login.titulo')}
      subtitulo={t('auth.login.subtitulo')}
      chamada
      rodape={
        <View className="flex-row items-center">
          <Texto cor="suave">{t('auth.login.novoPorAqui')}</Texto>
          <Botao
            variante="fantasma"
            titulo={t('auth.login.criarConta')}
            aoPressionar={() => {
              router.push('/cadastro');
            }}
          />
        </View>
      }
    >
      {vinculo ? <Texto cor="atencao">{vinculo}</Texto> : null}
      <CampoControlado
        controle={formulario.control}
        nome="email"
        rotulo={t('auth.campos.email')}
        mensagemErro={t('auth.validacao.email')}
        aparar
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
      />
      <CampoControlado
        controle={formulario.control}
        nome="senha"
        rotulo={t('auth.campos.senha')}
        mensagemErro={t('auth.validacao.senhaLogin')}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void entrar()}
      />
      <ErroDoFormulario mensagem={erro} />
      <Botao
        titulo={t('auth.login.entrar')}
        aoPressionar={() => void entrar()}
        carregando={formulario.formState.isSubmitting}
        larguraTotal
      />
      <Botao
        variante="fantasma"
        titulo={t('auth.login.esqueci')}
        aoPressionar={() => {
          router.push('/recuperar-senha');
        }}
      />
      <BotaoGoogle aoPedirSenha={pedirSenha} />
    </TelaFormulario>
  );
}
