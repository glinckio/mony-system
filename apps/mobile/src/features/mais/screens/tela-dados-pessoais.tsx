import {
  type DadosAtualizacaoPerfil,
  esquemaAtualizacaoPerfil,
  type Perfil,
} from '@mony/shared/usuario';
import { normalizarTelefoneBr } from '@mony/shared/autenticacao';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { type FieldErrors, type Resolver, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { CampoControlado, mensagemDeErro } from '@/lib/formularios';
import { telefoneParaTexto } from '@/lib/nomes';
import { Botao, Cabecalho, Campo, Erro, Skeleton, Tela, Texto } from '@/ui';

import { useAtualizarPerfil, usePerfil } from '../hooks/use-perfil';

interface ValoresDados {
  nome: string;
  telefone: string;
}

/** Só o que mudou; o telefone compara já normalizado (`+55…`), como a API guarda. */
function mudancas(valores: ValoresDados, perfil: Perfil): DadosAtualizacaoPerfil {
  const nome = valores.nome.trim();
  const telefone = normalizarTelefoneBr(valores.telefone);
  return {
    ...(nome === perfil.nome ? {} : { nome }),
    ...(telefone === null || telefone === perfil.telefone ? {} : { telefone: valores.telefone }),
  };
}

function FormularioDados({ perfil }: { perfil: Perfil }) {
  const { t } = useTranslation();
  const router = useRouter();
  const atualizar = useAtualizarPerfil();
  const [erroEnvio, definirErroEnvio] = useState<string | null>(null);

  const resolver: Resolver<ValoresDados> = (valores) => {
    const resultado = esquemaAtualizacaoPerfil.safeParse({
      nome: valores.nome,
      telefone: valores.telefone,
    });
    if (resultado.success) return { values: valores, errors: {} };
    const errors: FieldErrors<ValoresDados> = {};
    for (const problema of resultado.error.issues) {
      const campo = problema.path[0] === 'nome' ? 'nome' : 'telefone';
      errors[campo] = { type: 'validate', message: campo };
    }
    return { values: {}, errors };
  };
  const formulario = useForm<ValoresDados>({
    resolver,
    defaultValues: {
      nome: perfil.nome,
      telefone: perfil.telefone === null ? '' : telefoneParaTexto(perfil.telefone),
    },
  });

  function voltar() {
    router.dismissTo('/mais/perfil');
  }

  const salvar = formulario.handleSubmit(async (valores) => {
    definirErroEnvio(null);
    const dados = mudancas(valores, perfil);
    try {
      if (Object.keys(dados).length > 0) await atualizar.mutateAsync(dados);
      voltar();
    } catch (falha) {
      definirErroEnvio(mensagemDeErro(falha, t('mais.semConexao')));
    }
  });

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerClassName="gap-5 pb-8 pt-3" keyboardShouldPersistTaps="handled">
        <CampoControlado
          controle={formulario.control}
          nome="nome"
          rotulo={t('mais.dados.nome')}
          mensagemErro={t('mais.dados.validacao.nome')}
          autoComplete="name"
          maxLength={120}
        />
        <Campo
          rotulo={t('mais.dados.email')}
          ajuda={t('mais.dados.emailAjuda')}
          value={perfil.email}
          editable={false}
        />
        <CampoControlado
          controle={formulario.control}
          nome="telefone"
          rotulo={t('mais.dados.telefone')}
          mensagemErro={t('mais.dados.validacao.telefone')}
          keyboardType="phone-pad"
          autoComplete="tel"
          maxLength={30}
        />
        {erroEnvio === null ? null : (
          <Texto cor="perigo" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {erroEnvio}
          </Texto>
        )}
        <Botao
          titulo={t('mais.dados.salvar')}
          larguraTotal
          carregando={formulario.formState.isSubmitting}
          aoPressionar={() => void salvar()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Dados pessoais (`/mais/dados-pessoais`): nome e celular (`PATCH /me`); o e-mail só aparece. */
export default function TelaDadosPessoais() {
  const { t } = useTranslation();
  const router = useRouter();
  const perfil = usePerfil();
  return (
    <Tela degrade={false} className="px-4 pt-2">
      <Cabecalho
        titulo={t('mais.dados.titulo')}
        aoVoltar={() => {
          router.dismissTo('/mais/perfil');
        }}
      />
      {perfil.data ? (
        <FormularioDados key={perfil.data.id} perfil={perfil.data} />
      ) : perfil.isError ? (
        <Erro aoTentarDeNovo={() => void perfil.refetch()} />
      ) : (
        <View className="gap-4 pt-3">
          <Skeleton altura={50} />
          <Skeleton altura={50} />
        </View>
      )}
    </Tela>
  );
}
