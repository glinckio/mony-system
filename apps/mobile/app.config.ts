import type { ConfigContext, ExpoConfig } from 'expo/config';

import pacote from './package.json';

/*
 * Configuração do app por ambiente. O perfil do `eas.json` define `APP_ENV`; localmente o padrão é
 * `development`. Valores públicos podem ser trocados por variável (`.env` local ou variáveis do
 * EAS): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SENTRY_DSN`.
 *
 * Este arquivo só importa pacotes: o Expo compila o app.config.ts, mas não os arquivos locais que
 * ele importaria.
 */

/** Um ambiente por perfil do `eas.json` (docs/arquitetura/12). */
export const AMBIENTES = ['development', 'preview', 'production'] as const;

export type Ambiente = (typeof AMBIENTES)[number];

/** Configuração pública que vai em `extra` e o app lê em execução (`src/lib/ambiente.ts`). */
export interface ConfigPublica {
  ambiente: Ambiente;
  /** Endereço da API sem `/v1` e sem barra no fim, ex.: `https://api.exemplo.com.br`. */
  urlApi: string;
  /** DSN do Sentry. Sem ele, o Sentry fica desligado. */
  sentryDsn: string | undefined;
}

/**
 * Identificador nas lojas (bundle ID / package). Provisório: confirmar com o cliente antes do
 * primeiro build de loja (docs/arquitetura/15, pergunta 16). Depois de publicado, não muda mais.
 */
const IDENTIFICADOR = 'com.monitorizze.app';

interface DadosAmbiente {
  nome: string;
  identificador: string;
  /** Esquema de deep link. Um por ambiente, para os três apps conviverem no mesmo aparelho. */
  esquema: string;
  /** API padrão do ambiente; `EXPO_PUBLIC_API_URL` tem prioridade. */
  urlApi?: string;
}

const DADOS_POR_AMBIENTE: Record<Ambiente, DadosAmbiente> = {
  development: {
    nome: 'Monitorizze Dev',
    identificador: `${IDENTIFICADOR}.dev`,
    esquema: 'mony-dev',
    // Simulador iOS. No emulador Android use http://10.0.2.2:3000; em aparelho, o IP do computador.
    urlApi: 'http://localhost:3000',
  },
  // A API de staging e a de produção dependem do domínio do cliente: até lá, vêm da variável
  // EXPO_PUBLIC_API_URL do ambiente no EAS.
  preview: {
    nome: 'Monitorizze Preview',
    identificador: `${IDENTIFICADOR}.preview`,
    esquema: 'mony-preview',
  },
  production: {
    nome: 'Monitorizze',
    identificador: IDENTIFICADOR,
    esquema: 'mony',
  },
};

/**
 * Conta e projeto do EAS. Preencher depois do `eas init` na conta Expo do cliente (ou usar as
 * variáveis `EXPO_OWNER` e `EAS_PROJECT_ID`). Sem projeto, o EAS Update fica desligado.
 */
const PROJETO_EAS: { dono?: string; id?: string } = {};

type Variaveis = Record<string, string | undefined>;

function ehAmbiente(valor: string): valor is Ambiente {
  return (AMBIENTES as readonly string[]).includes(valor);
}

function texto(valor: string | undefined): string | undefined {
  return valor === undefined || valor.trim() === '' ? undefined : valor.trim();
}

export function criarConfigApp(base: ConfigContext['config'], variaveis: Variaveis): ExpoConfig {
  const ambiente = texto(variaveis.APP_ENV) ?? 'development';
  if (!ehAmbiente(ambiente)) {
    throw new Error(`APP_ENV inválido: "${ambiente}". Use development, preview ou production.`);
  }
  const dados = DADOS_POR_AMBIENTE[ambiente];
  const urlApi = texto(variaveis.EXPO_PUBLIC_API_URL) ?? dados.urlApi;
  if (urlApi === undefined) {
    throw new Error(`Defina EXPO_PUBLIC_API_URL para o ambiente ${ambiente}.`);
  }
  const dono = PROJETO_EAS.dono ?? texto(variaveis.EXPO_OWNER);
  const idProjeto = PROJETO_EAS.id ?? texto(variaveis.EAS_PROJECT_ID);
  const extra: ConfigPublica & { eas?: { projectId: string } } = {
    ambiente,
    urlApi: urlApi.replace(/\/+$/, ''),
    sentryDsn: texto(variaveis.EXPO_PUBLIC_SENTRY_DSN),
  };
  if (idProjeto) extra.eas = { projectId: idProjeto };

  return {
    ...base,
    name: dados.nome,
    slug: 'monitorizze',
    ...(dono ? { owner: dono } : {}),
    version: pacote.version,
    scheme: dados.esquema,
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    // Claro até o design do cliente dizer se há modo escuro (docs/arquitetura/04).
    userInterfaceStyle: 'light',
    // O EAS Update só entrega JS compatível com o binário instalado (docs/arquitetura/03).
    runtimeVersion: { policy: 'fingerprint' },
    updates: idProjeto
      ? { url: `https://u.expo.dev/${idProjeto}`, enabled: true }
      : { enabled: false },
    ios: {
      bundleIdentifier: dados.identificador,
      supportsTablet: false,
    },
    android: {
      package: dados.identificador,
    },
    plugins: [
      'expo-router',
      // Envio de source maps no build do EAS: precisa de SENTRY_AUTH_TOKEN (segredo no EAS) ou
      // SENTRY_DISABLE_AUTO_UPLOAD=true.
      [
        '@sentry/react-native/expo',
        {
          organization: texto(variaveis.SENTRY_ORG),
          project: texto(variaveis.SENTRY_PROJECT) ?? 'mobile',
          url: 'https://sentry.io/',
        },
      ],
    ],
    experiments: {
      reactCompiler: true,
    },
    extra,
  };
}

export default ({ config }: ConfigContext): ExpoConfig => criarConfigApp(config, process.env);
