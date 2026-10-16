import { zodResolver } from '@hookform/resolvers/zod';
import { cadastrarAutenticacao } from '@mony/api-client';
import { esquemaCadastro, VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { dadosDoAparelho } from '@/lib/auth/aparelho';
import { comecarSessao } from '@/lib/auth/sessao';
import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { Botao, CaixaDeSelecao, Texto } from '@/ui';

import { ErroDoFormulario, TelaFormulario } from './tela-formulario';

const esquemaFormulario = esquemaCadastro.pick({
  nome: true,
  email: true,
  telefone: true,
  senha: true,
});

/** Cadastro (RN-001), com o aceite dos termos e da política nas versões atuais (RN-007). */
export default function TelaCadastro() {
  const { t } = useTranslation();
  const router = useRouter();
  const [aceite, definirAceite] = useState(false);
  const [faltaAceite, definirFaltaAceite] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const formulario = useForm({
    resolver: zodResolver(esquemaFormulario),
    defaultValues: { nome: '', email: '', telefone: '', senha: '' },
  });

  const criar = formulario.handleSubmit(async (dados) => {
    definirErro(null);
    if (!aceite) {
      definirFaltaAceite(true);
      return;
    }
    try {
      const sessao = await cadastrarAutenticacao({
        ...dados,
        aceites: { ...VERSOES_DOCUMENTOS },
        dispositivo: await dadosDoAparelho(),
      });
      await comecarSessao(sessao);
    } catch (falha) {
      definirErro(mensagemDeErro(falha, t('auth.semConexao')));
    }
  });

  return (
    <TelaFormulario titulo={t('auth.cadastro.titulo')}>
      <CampoControlado
        controle={formulario.control}
        nome="nome"
        rotulo={t('auth.campos.nome')}
        mensagemErro={t('auth.validacao.nome')}
        autoComplete="name"
        textContentType="name"
      />
      <CampoControlado
        controle={formulario.control}
        nome="email"
        rotulo={t('auth.campos.email')}
        mensagemErro={t('auth.validacao.email')}
        aparar
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <CampoControlado
        controle={formulario.control}
        nome="telefone"
        rotulo={t('auth.campos.telefone')}
        mensagemErro={t('auth.validacao.telefone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <CampoControlado
        controle={formulario.control}
        nome="senha"
        rotulo={t('auth.campos.senha')}
        mensagemErro={t('auth.validacao.senha')}
        ajuda={t('auth.ajudaSenha')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <CaixaDeSelecao
        rotulo={t('auth.cadastro.aceite')}
        marcada={aceite}
        aoMudar={(marcada) => {
          definirAceite(marcada);
          if (marcada) definirFaltaAceite(false);
        }}
        erro={faltaAceite ? t('auth.validacao.aceite') : null}
        testID="cadastro-aceite"
      />
      <ErroDoFormulario mensagem={erro} />
      <Botao
        titulo={t('auth.cadastro.criar')}
        aoPressionar={() => void criar()}
        carregando={formulario.formState.isSubmitting}
        larguraTotal
        testID="cadastro-criar"
      />
      <Botao
        variante="fantasma"
        titulo={t('auth.cadastro.jaTenho')}
        aoPressionar={() => {
          router.back();
        }}
      />
      <Texto variante="legenda" cor="suave">
        {`${VERSOES_DOCUMENTOS.termos} · ${VERSOES_DOCUMENTOS.privacidade}`}
      </Texto>
    </TelaFormulario>
  );
}
