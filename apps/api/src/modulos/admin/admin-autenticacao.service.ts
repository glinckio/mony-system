import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type {
  AdminLogado,
  DadosLoginAdmin,
  DesafioAdmin,
  Novo2fa,
  SessaoAdmin,
} from '@mony/shared/admin';
import { normalizarEmail } from '@mony/shared/autenticacao';

import { CifraSegredos } from '../../core/auth/cifra-segredos';
import {
  conferirTotp,
  enderecoTotp,
  gerarSegredoTotp,
  PASSO_TOTP_SEGUNDOS,
} from '../../core/auth/totp';
import {
  DURACAO_MAXIMA_SESSAO_ADMIN_SEGUNDOS,
  TokensAcesso,
  type UsuarioAutenticado,
} from '../../core/auth/tokens-acesso';
import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { LimiteTentativas } from '../../core/limites/limite-tentativas';
import {
  JANELA_TENTATIVAS_SEGUNDOS,
  MAXIMO_TENTATIVAS_EMAIL,
  MAXIMO_TENTATIVAS_IP,
  resumir,
} from '../autenticacao/dominio/sessoes';
import { conferirSenha } from '../autenticacao/senhas';
import { AdminAutenticacaoRepository, type UsuarioDoPainel } from './admin-autenticacao.repository';

/** Códigos errados de 2FA por admin na janela de 15 minutos. */
export const MAXIMO_TENTATIVAS_2FA = 5;

/** Admin que pode entrar no painel: papel `admin` e conta ativa. */
function podeEntrar(usuario: UsuarioDoPainel | null): usuario is UsuarioDoPainel {
  return usuario !== null && usuario.papel === 'admin' && usuario.status === 'ativo';
}

const resumo = (usuario: UsuarioDoPainel): AdminLogado => ({
  id: usuario.id,
  nome: usuario.nome,
  email: usuario.email,
});

/**
 * Login do painel admin (T-104a, docs/arquitetura/11 e 13): senha de quem tem papel `admin`, depois
 * o código do 2FA (TOTP), obrigatório. O primeiro acesso configura o 2FA. A sessão é um token de 15
 * minutos, renovado até 8 horas depois do login. Entradas e falhas do 2FA vão para a auditoria.
 */
@Injectable()
export class AdminAutenticacaoService {
  constructor(
    private readonly repositorio: AdminAutenticacaoRepository,
    private readonly tokens: TokensAcesso,
    private readonly cifra: CifraSegredos,
    private readonly limites: LimiteTentativas,
    private readonly clock: Clock,
  ) {}

  /**
   * Senha certa de um admin ativo: o desafio do 2FA. Quem não é admin recebe o mesmo
   * `CREDENCIAIS_INVALIDAS` da senha errada, para o painel não revelar quem é admin.
   */
  async entrar(dados: DadosLoginAdmin, ip: string): Promise<DesafioAdmin> {
    const email = normalizarEmail(dados.email);
    const chaveEmail = `admin:login:email:${resumir(email)}`;
    await this.limites.registrar(
      [
        { chave: chaveEmail, maximo: MAXIMO_TENTATIVAS_EMAIL },
        { chave: `admin:login:ip:${ip}`, maximo: MAXIMO_TENTATIVAS_IP },
      ],
      JANELA_TENTATIVAS_SEGUNDOS,
    );
    const usuario = await this.repositorio.buscarPorEmail(email);
    const senhaConfere = await conferirSenha(usuario?.senhaHash ?? null, dados.senha);
    if (!senhaConfere || !podeEntrar(usuario)) throw new ErroDominio('CREDENCIAIS_INVALIDAS');
    await this.limites.zerar(chaveEmail);
    const desafio = await this.tokens.emitirDesafioAdmin(usuario.id);
    return {
      desafio: desafio.token,
      expiraEm: desafio.expiraEm.toISOString(),
      configurar2fa: usuario.totpAtivadoEm === null,
    };
  }

  /** Primeiro acesso: um segredo novo, que só vale depois do primeiro código certo. */
  async novo2fa(desafio: string): Promise<Novo2fa> {
    const usuario = await this.adminDoDesafio(desafio);
    if (usuario.totpAtivadoEm !== null) throw new ErroDominio('CONFLITO');
    const segredo = gerarSegredoTotp();
    const guardado = await this.repositorio.guardarSegredoPendente(
      usuario.id,
      this.cifra.cifrar(segredo),
    );
    if (!guardado) throw new ErroDominio('CONFLITO');
    return { segredo, endereco: enderecoTotp(segredo, usuario.email) };
  }

  /** O código do aplicativo autenticador: abre a sessão do painel (e confirma o 2FA novo). */
  async conferir2fa(desafio: string, codigo: string, ip: string): Promise<SessaoAdmin> {
    const usuario = await this.adminDoDesafio(desafio);
    await this.limites.registrar(
      [{ chave: `admin:2fa:${usuario.id}`, maximo: MAXIMO_TENTATIVAS_2FA }],
      JANELA_TENTATIVAS_SEGUNDOS,
    );
    if (usuario.totpSegredo === null) throw new ErroDominio('CODIGO_INVALIDO');
    const agora = this.clock.agora();
    const passo = conferirTotp(this.cifra.decifrar(usuario.totpSegredo), codigo, agora);
    // O mesmo código não entra duas vezes (alguém olhando a tela ou repetindo a requisição).
    const inedito =
      passo !== null &&
      (await this.limites.usarUmaVez(
        `admin:2fa:passo:${usuario.id}:${passo}`,
        3 * PASSO_TOTP_SEGUNDOS,
      ));
    if (!inedito) {
      await this.repositorio.auditar({ usuarioId: usuario.id, acao: 'admin.2fa_recusado', ip });
      throw new ErroDominio('CODIGO_INVALIDO');
    }
    await this.limites.zerar(`admin:2fa:${usuario.id}`);
    const primeiroAcesso = usuario.totpAtivadoEm === null;
    if (primeiroAcesso) await this.repositorio.ativar2fa(usuario.id, agora);
    await this.repositorio.marcarAcesso(usuario.id, agora);
    await this.repositorio.auditar({
      usuarioId: usuario.id,
      acao: 'admin.entrou',
      ip,
      depois: { primeiroAcesso },
    });
    const autenticadoEm = Math.floor(agora.getTime() / 1000);
    const sessao = await this.tokens.emitirAdmin(usuario.id, randomUUID(), autenticadoEm);
    return { admin: resumo(usuario), token: sessao.token, expiraEm: sessao.expiraEm.toISOString() };
  }

  /**
   * Token novo para a mesma sessão, enquanto o admin continua admin e ativo, até 8 horas depois do
   * login. Bloquear ou rebaixar o admin derruba o painel na próxima renovação.
   */
  async renovar(atual: UsuarioAutenticado): Promise<SessaoAdmin> {
    const autenticadoEm = atual.autenticadoEm ?? 0;
    const agora = Math.floor(this.clock.agora().getTime() / 1000);
    if (agora >= autenticadoEm + DURACAO_MAXIMA_SESSAO_ADMIN_SEGUNDOS) {
      throw new ErroDominio('SESSAO_INVALIDA');
    }
    const usuario = await this.repositorio.buscarPorId(atual.id);
    if (!podeEntrar(usuario) || usuario.totpAtivadoEm === null) {
      throw new ErroDominio('SESSAO_INVALIDA');
    }
    const sessao = await this.tokens.emitirAdmin(atual.id, atual.sessaoId, autenticadoEm);
    return { admin: resumo(usuario), token: sessao.token, expiraEm: sessao.expiraEm.toISOString() };
  }

  async eu(atual: UsuarioAutenticado): Promise<AdminLogado> {
    const usuario = await this.repositorio.buscarPorId(atual.id);
    if (!podeEntrar(usuario)) throw new ErroDominio('SESSAO_INVALIDA');
    return resumo(usuario);
  }

  private async adminDoDesafio(desafio: string): Promise<UsuarioDoPainel> {
    const id = await this.tokens.verificarDesafioAdmin(desafio);
    const usuario = await this.repositorio.buscarPorId(id);
    if (!podeEntrar(usuario)) throw new ErroDominio('SESSAO_INVALIDA');
    return usuario;
  }
}
