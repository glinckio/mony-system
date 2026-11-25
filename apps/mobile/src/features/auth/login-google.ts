import {
  ErroApi,
  entrarComLoginSocialAutenticacao,
  vincularLoginSocialAutenticacao,
} from '@mony/api-client';
import type { DadosLoginSocial } from '@mony/shared/autenticacao';
import type { ProvedorLoginSocial } from '@mony/shared/enums';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { dadosDoAparelho } from '@/lib/auth/aparelho';
import { escolherContaGoogle } from '@/lib/auth/google';
import { comecarSessao } from '@/lib/auth/sessao';
import { mensagemDeErro } from '@/lib/formularios';

/** O que o Google ou a Apple devolveram: a Apple traz também o nonce original (T-055b). */
export interface ContaSocial {
  provedor: ProvedorLoginSocial;
  idToken: string;
  nonce?: string;
  nome: string | null;
}

/**
 * O login do Google ou da Apple que ainda falta terminar (RN-002): o mesmo `id_token` volta ao
 * servidor com o que faltou. Fica só em memória, pelo tempo de completar o cadastro ou de entrar com
 * a senha.
 */
export interface LoginGooglePendente {
  provedor: ProvedorLoginSocial;
  idToken: string;
  nonce?: string;
  /** `cadastro`: conta nova sem telefone ou aceites. `vinculo`: o e-mail já tem conta com senha. */
  motivo: 'cadastro' | 'vinculo';
  email: string | null;
  nome: string | null;
}

let pendente: LoginGooglePendente | null = null;

export function loginGooglePendente(): LoginGooglePendente | null {
  return pendente;
}

export function esquecerLoginGoogle(): void {
  pendente = null;
}

function textoDe(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

/** Manda o login ao servidor; com sucesso, a sessão começa e o pendente é esquecido. */
export async function entrarComGoogle(
  conta: Pick<ContaSocial, 'provedor' | 'idToken' | 'nonce'>,
  extras: Pick<DadosLoginSocial, 'nome' | 'telefone' | 'aceites'> = {},
): Promise<void> {
  const sessao = await entrarComLoginSocialAutenticacao({
    provedor: conta.provedor,
    idToken: conta.idToken,
    ...(conta.nonce === undefined ? {} : { nonce: conta.nonce }),
    ...extras,
    dispositivo: await dadosDoAparelho(),
  });
  pendente = null;
  await comecarSessao(sessao);
}

/**
 * Depois de entrar com a senha, liga o Google pendente à conta. Falhar aqui não impede a entrada:
 * a pessoa só continua sem o Google ligado.
 */
export async function vincularGooglePendente(): Promise<void> {
  const atual = pendente;
  pendente = null;
  if (atual?.motivo !== 'vinculo') return;
  await vincularLoginSocialAutenticacao({
    provedor: atual.provedor,
    idToken: atual.idToken,
    ...(atual.nonce === undefined ? {} : { nonce: atual.nonce }),
  }).catch(() => undefined);
}

/**
 * Os botões "Entrar com Google" e "Entrar com a Apple" do login e do cadastro: escolhe a conta e
 * entra; conta nova sem os dados obrigatórios vai para "Complete seu cadastro"; e-mail que já tem
 * conta pede a senha uma vez.
 */
export function useEntrarComGoogle(
  aoPedirSenha: (email: string | null, provedor: ProvedorLoginSocial) => void,
  escolher: () => Promise<ContaSocial | null> = async () => {
    const conta = await escolherContaGoogle();
    return conta === null ? null : { provedor: 'google', ...conta };
  },
) {
  const { t } = useTranslation();
  const router = useRouter();
  const [ocupado, definirOcupado] = useState(false);
  const [erro, definirErro] = useState<string | null>(null);

  async function entrar() {
    let provedor: ProvedorLoginSocial = 'google';
    definirErro(null);
    definirOcupado(true);
    try {
      const conta = await escolher();
      if (conta === null) return;
      provedor = conta.provedor;
      const credencial = {
        idToken: conta.idToken,
        ...(conta.nonce === undefined ? {} : { nonce: conta.nonce }),
      };
      try {
        await entrarComGoogle(conta);
      } catch (falha) {
        if (!(falha instanceof ErroApi)) throw falha;
        const detalhes = falha.resposta?.erro.detalhes ?? {};
        if (falha.codigo === 'CADASTRO_INCOMPLETO') {
          pendente = {
            ...credencial,
            provedor: conta.provedor,
            motivo: 'cadastro',
            email: textoDe(detalhes.email),
            nome: textoDe(detalhes.nome) ?? conta.nome,
          };
          router.push('/completar-cadastro');
          return;
        }
        if (falha.codigo === 'VINCULO_SOCIAL_PENDENTE') {
          const email = textoDe(detalhes.email);
          pendente = {
            ...credencial,
            provedor: conta.provedor,
            motivo: 'vinculo',
            email,
            nome: conta.nome,
          };
          aoPedirSenha(email, conta.provedor);
          return;
        }
        throw falha;
      }
    } catch (falha) {
      definirErro(
        falha instanceof ErroApi
          ? mensagemDeErro(falha, t('auth.semConexao'))
          : t(provedor === 'apple' ? 'auth.apple.erro' : 'auth.google.erro'),
      );
    } finally {
      definirOcupado(false);
    }
  }

  return { entrar, ocupado, erro };
}
