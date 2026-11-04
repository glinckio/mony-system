import { zodResolver } from '@hookform/resolvers/zod';
import { esquemaCadastro, VERSOES_DOCUMENTOS } from '@mony/shared/autenticacao';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { Botao, CaixaDeSelecao, Texto } from '@/ui';

import { entrarComGoogle, esquecerLoginGoogle, loginGooglePendente } from '../login-google';
import { ErroDoFormulario, TelaFormulario } from './tela-formulario';

const esquemaFormulario = esquemaCadastro.pick({ nome: true, telefone: true });

/**
 * Conta nova pelo Google (RN-002, T-055a): o servidor respondeu `CADASTRO_INCOMPLETO`, então falta o
 * celular e o aceite dos termos (RN-007), e o nome quando o Google não mandou. O mesmo `id_token`
 * volta com eles.
 */
export default function TelaCompletarCadastro() {
  const { t } = useTranslation();
  const router = useRouter();
  const [pendente] = useState(() => loginGooglePendente());
  const [aceite, definirAceite] = useState(false);
  const [faltaAceite, definirFaltaAceite] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);
  const formulario = useForm({
    resolver: zodResolver(esquemaFormulario),
    defaultValues: { nome: pendente?.nome ?? '', telefone: '' },
  });

  function voltar() {
    esquecerLoginGoogle();
    router.back();
  }

  const criar = formulario.handleSubmit(async (dados) => {
    definirErro(null);
    if (pendente?.motivo !== 'cadastro') return;
    if (!aceite) {
      definirFaltaAceite(true);
      return;
    }
    try {
      await entrarComGoogle(pendente.idToken, { ...dados, aceites: { ...VERSOES_DOCUMENTOS } });
    } catch (falha) {
      definirErro(mensagemDeErro(falha, t('auth.semConexao')));
    }
  });

  if (pendente?.motivo !== 'cadastro') {
    return (
      <TelaFormulario titulo={t('auth.completar.titulo')}>
        <Texto cor="suave">{t('auth.completar.expirou')}</Texto>
        <Botao titulo={t('auth.completar.voltar')} aoPressionar={voltar} larguraTotal />
      </TelaFormulario>
    );
  }

  return (
    <TelaFormulario titulo={t('auth.completar.titulo')} subtitulo={t('auth.completar.explicacao')}>
      {pendente.email ? <Texto cor="suave">{pendente.email}</Texto> : null}
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
        nome="telefone"
        rotulo={t('auth.campos.telefone')}
        mensagemErro={t('auth.validacao.telefone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <CaixaDeSelecao
        rotulo={t('auth.cadastro.aceite')}
        marcada={aceite}
        aoMudar={(marcada) => {
          definirAceite(marcada);
          if (marcada) definirFaltaAceite(false);
        }}
        erro={faltaAceite ? t('auth.validacao.aceite') : null}
      />
      <ErroDoFormulario mensagem={erro} />
      <Botao
        titulo={t('auth.completar.criar')}
        aoPressionar={() => void criar()}
        carregando={formulario.formState.isSubmitting}
        larguraTotal
      />
      <Botao variante="fantasma" titulo={t('auth.completar.voltar')} aoPressionar={voltar} />
      <Texto variante="legenda" cor="suave">
        {`${VERSOES_DOCUMENTOS.termos} · ${VERSOES_DOCUMENTOS.privacidade}`}
      </Texto>
    </TelaFormulario>
  );
}
