import { Injectable } from '@nestjs/common';
import type { DadosLoginSocial, DadosVinculoSocial, Sessao } from '@mony/shared/autenticacao';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { LimiteTentativas } from '../../core/limites/limite-tentativas';
import {
  type IdentidadeSocial,
  nonceConfere,
  NOMES_PROVEDORES,
  VerificadorLoginSocial,
} from '../../integracoes/login-social/verificador-login-social';
import { AutenticacaoRepository } from './autenticacao.repository';
import { AutenticacaoService } from './autenticacao.service';
import { JANELA_TENTATIVAS_SEGUNDOS, MAXIMO_TENTATIVAS_IP, resumir } from './dominio/sessoes';

/** Dados que uma conta nova precisa e o login social pode não trazer. */
type CampoCadastro = 'nome' | 'telefone' | 'aceites';

/**
 * Login com Google e Apple (RN-002). O `id_token` é conferido no servidor e vale uma vez só.
 * Login social com o e-mail de uma conta que já existe não entra direto: a pessoa entra com a
 * senha (ou recupera pelo código) e depois vincula, para ninguém tomar a conta de outro criando um
 * login social com o mesmo e-mail.
 */
@Injectable()
export class LoginSocialService {
  constructor(
    private readonly verificador: VerificadorLoginSocial,
    private readonly repositorio: AutenticacaoRepository,
    private readonly autenticacao: AutenticacaoService,
    private readonly limites: LimiteTentativas,
    private readonly clock: Clock,
  ) {}

  /**
   * Entra (login social já vinculado) ou cria a conta. Respostas de erro pedem ao app o próximo
   * passo: `VINCULO_SOCIAL_PENDENTE` (o e-mail já tem conta) ou `CADASTRO_INCOMPLETO` (faltam
   * nome, telefone ou aceites; o app chama de novo com o mesmo token).
   */
  async entrar(dados: DadosLoginSocial, ip: string): Promise<Sessao> {
    await this.limites.registrar(
      [{ chave: `social:ip:${ip}`, maximo: MAXIMO_TENTATIVAS_IP }],
      JANELA_TENTATIVAS_SEGUNDOS,
    );
    const identidade = await this.identificar(dados);

    const usuario = await this.repositorio.buscarPorLoginSocial(
      identidade.provedor,
      identidade.idExterno,
    );
    if (usuario) {
      if (usuario.status === 'excluido') throw this.naoConfirmado(identidade);
      if (usuario.status === 'bloqueado') throw new ErroDominio('CONTA_BLOQUEADA');
      await this.gastarToken(dados.idToken, identidade);
      return this.autenticacao.iniciarSessao(usuario, dados.dispositivo);
    }

    const { email } = identidade;
    if (email === null || !identidade.emailVerificado) {
      throw new ErroDominio('CREDENCIAIS_INVALIDAS', {
        mensagem: `Sua conta ${NOMES_PROVEDORES[identidade.provedor].do} não tem e-mail confirmado. Entre com e-mail e senha.`,
      });
    }
    if (await this.repositorio.buscarPorEmail(email)) {
      throw new ErroDominio('VINCULO_SOCIAL_PENDENTE', { detalhes: { email } });
    }

    const nome = dados.nome ?? identidade.nome;
    const faltando: CampoCadastro[] = [];
    if (nome === null) faltando.push('nome');
    if (dados.telefone === undefined) faltando.push('telefone');
    if (dados.aceites === undefined) faltando.push('aceites');
    if (nome === null || dados.telefone === undefined || dados.aceites === undefined) {
      throw new ErroDominio('CADASTRO_INCOMPLETO', { detalhes: { faltando, email, nome } });
    }

    await this.gastarToken(dados.idToken, identidade);
    return this.autenticacao.cadastrarPorLoginSocial(
      {
        nome,
        email,
        telefone: dados.telefone,
        aceites: dados.aceites,
        loginSocial: { provedor: identidade.provedor, idExterno: identidade.idExterno },
      },
      dados.dispositivo,
      ip,
    );
  }

  /** RN-002: liga o Google ou a Apple à conta de quem já entrou. */
  async vincular(usuario: UsuarioAutenticado, dados: DadosVinculoSocial): Promise<void> {
    const identidade = await this.identificar(dados);
    await this.gastarToken(dados.idToken, identidade);
    const resultado = await this.repositorio.vincularLoginSocial(
      usuario.id,
      identidade.provedor,
      identidade.idExterno,
    );
    if (resultado === 'de-outra-conta') {
      throw new ErroDominio('CONFLITO', {
        mensagem: `Esta conta ${NOMES_PROVEDORES[identidade.provedor].do} já está ligada a outro usuário.`,
      });
    }
  }

  private async identificar(dados: DadosVinculoSocial): Promise<IdentidadeSocial> {
    const identidade = await this.verificador.verificar(dados.provedor, dados.idToken);
    if (!nonceConfere(identidade, dados.nonce)) throw this.naoConfirmado(identidade);
    return identidade;
  }

  /**
   * O mesmo `id_token` não entra duas vezes (contra repetição de um token copiado). Só é gasto
   * quando dá certo: depois de `CADASTRO_INCOMPLETO` ou `VINCULO_SOCIAL_PENDENTE`, o app usa o
   * mesmo token de novo.
   */
  private async gastarToken(idToken: string, identidade: IdentidadeSocial): Promise<void> {
    const segundos = Math.max(
      60,
      Math.ceil((identidade.expiraEm.getTime() - this.clock.agora().getTime()) / 1000) + 60,
    );
    if (!(await this.limites.usarUmaVez(`social:${resumir(idToken)}`, segundos))) {
      throw this.naoConfirmado(identidade);
    }
  }

  private naoConfirmado(identidade: Pick<IdentidadeSocial, 'provedor'>): ErroDominio {
    return new ErroDominio('CREDENCIAIS_INVALIDAS', {
      mensagem: `Não conseguimos confirmar seu login com ${NOMES_PROVEDORES[identidade.provedor].o}. Tente de novo.`,
    });
  }
}
