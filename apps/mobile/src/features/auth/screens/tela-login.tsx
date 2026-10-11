import { zodResolver } from '@hookform/resolvers/zod';
import { entrarAutenticacao } from '@mony/api-client';
import { esquemaLogin } from '@mony/shared/autenticacao';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { dadosDoAparelho } from '@/lib/auth/aparelho';
import { comecarSessao } from '@/lib/auth/sessao';
import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { Botao } from '@/ui';

import { ErroDoFormulario, TelaFormulario } from './tela-formulario';

const esquemaFormulario = esquemaLogin.pick({ email: true, senha: true });

/** Login com e-mail e senha (RN-002). Google e Apple entram na T-055. */
export default function TelaLogin() {
  const { t } = useTranslation();
  const router = useRouter();
  const [erro, definirErro] = useState<string | null>(null);
  const formulario = useForm({
    resolver: zodResolver(esquemaFormulario),
    defaultValues: { email: '', senha: '' },
  });

  const entrar = formulario.handleSubmit(async (dados) => {
    definirErro(null);
    try {
      const sessao = await entrarAutenticacao({ ...dados, dispositivo: await dadosDoAparelho() });
      await comecarSessao(sessao);
    } catch (falha) {
      definirErro(mensagemDeErro(falha, t('auth.semConexao')));
    }
  });

  return (
    <TelaFormulario titulo={t('auth.login.titulo')}>
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
      <Botao
        variante="secundaria"
        titulo={t('auth.login.criarConta')}
        aoPressionar={() => {
          router.push('/cadastro');
        }}
      />
    </TelaFormulario>
  );
}
