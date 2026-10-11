import { zodResolver } from '@hookform/resolvers/zod';
import { pedirCodigoSenhaAutenticacao, redefinirSenhaAutenticacao } from '@mony/api-client';
import { esquemaPedidoCodigo, esquemaRedefinicaoSenha } from '@mony/shared/autenticacao';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { dadosDoAparelho } from '@/lib/auth/aparelho';
import { comecarSessao } from '@/lib/auth/sessao';
import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { Botao, Texto } from '@/ui';

import { ErroDoFormulario, TelaFormulario } from './tela-formulario';

const esquemaNovaSenha = esquemaRedefinicaoSenha.pick({ codigo: true, senha: true });

/**
 * Recuperação de senha (RN-003): e-mail → código de 6 dígitos → senha nova. A API responde igual
 * exista a conta ou não; a senha nova já entra no app e derruba os outros aparelhos.
 */
export default function TelaRecuperarSenha() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, definirEmail] = useState<string | null>(null);
  const [erro, definirErro] = useState<string | null>(null);
  const pedido = useForm({
    resolver: zodResolver(esquemaPedidoCodigo),
    defaultValues: { email: '' },
  });
  const novaSenha = useForm({
    resolver: zodResolver(esquemaNovaSenha),
    defaultValues: { codigo: '', senha: '' },
  });

  const pedirCodigo = pedido.handleSubmit(async (dados) => {
    definirErro(null);
    try {
      await pedirCodigoSenhaAutenticacao(dados);
      definirEmail(dados.email);
    } catch (falha) {
      definirErro(mensagemDeErro(falha, t('auth.semConexao')));
    }
  });

  const redefinir = novaSenha.handleSubmit(async (dados) => {
    if (email === null) return;
    definirErro(null);
    try {
      const sessao = await redefinirSenhaAutenticacao({
        ...dados,
        email,
        dispositivo: await dadosDoAparelho(),
      });
      await comecarSessao(sessao);
    } catch (falha) {
      definirErro(mensagemDeErro(falha, t('auth.semConexao')));
    }
  });

  return (
    <TelaFormulario titulo={t('auth.recuperar.titulo')}>
      {email === null ? (
        <>
          <Texto cor="suave">{t('auth.recuperar.pedido')}</Texto>
          <CampoControlado
            controle={pedido.control}
            nome="email"
            rotulo={t('auth.campos.email')}
            mensagemErro={t('auth.validacao.email')}
            aparar
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <ErroDoFormulario mensagem={erro} />
          <Botao
            titulo={t('auth.recuperar.enviarCodigo')}
            aoPressionar={() => void pedirCodigo()}
            carregando={pedido.formState.isSubmitting}
            larguraTotal
          />
        </>
      ) : (
        <>
          <Texto cor="suave">{t('auth.recuperar.explicacao')}</Texto>
          <CampoControlado
            controle={novaSenha.control}
            nome="codigo"
            rotulo={t('auth.campos.codigo')}
            mensagemErro={t('auth.validacao.codigo')}
            aparar
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <CampoControlado
            controle={novaSenha.control}
            nome="senha"
            rotulo={t('auth.campos.senhaNova')}
            mensagemErro={t('auth.validacao.senha')}
            ajuda={t('auth.ajudaSenha')}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <ErroDoFormulario mensagem={erro} />
          <Botao
            titulo={t('auth.recuperar.redefinir')}
            aoPressionar={() => void redefinir()}
            carregando={novaSenha.formState.isSubmitting}
            larguraTotal
          />
          <Botao
            variante="fantasma"
            titulo={t('auth.recuperar.reenviar')}
            aoPressionar={() => void pedirCodigo()}
          />
        </>
      )}
      <Botao
        variante="fantasma"
        titulo={t('auth.recuperar.voltar')}
        aoPressionar={() => {
          router.back();
        }}
      />
    </TelaFormulario>
  );
}
