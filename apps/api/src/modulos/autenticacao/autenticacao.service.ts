import { Injectable, Logger } from '@nestjs/common';
import {
  type DadosCadastro,
  type DadosLogin,
  normalizarEmail,
  normalizarTelefoneBr,
  type Sessao,
  VERSOES_DOCUMENTOS,
} from '@mony/shared/autenticacao';
import { DOCUMENTOS_ACEITE } from '@mony/shared/enums';

import { TokensAcesso, type UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { LimiteTentativas } from '../../core/limites/limite-tentativas';
import { AutenticacaoRepository, type UsuarioDaSessao } from './autenticacao.repository';
import {
  aceitesPendentes,
  DURACAO_TESTE_DIAS,
  gerarTokenRenovacao,
  JANELA_TENTATIVAS_SEGUNDOS,
  MAXIMO_TENTATIVAS_EMAIL,
  MAXIMO_TENTATIVAS_IP,
  resumir,
  somarDias,
  VALIDADE_RENOVACAO_DIAS,
} from './dominio/sessoes';
import { conferirSenha, gerarHashSenha } from './senhas';

/**
 * Cadastro, login, renovação e saída (RN-001 a RN-008, docs/arquitetura/11). O token de acesso é
 * um JWT de 15 minutos; o de renovação é aleatório, vale por aparelho e gira a cada uso.
 */
@Injectable()
export class AutenticacaoService {
  constructor(
    private readonly repositorio: AutenticacaoRepository,
    private readonly tokens: TokensAcesso,
    private readonly limites: LimiteTentativas,
    private readonly clock: Clock,
  ) {}

  private readonly log = new Logger(AutenticacaoService.name);

  /** RN-001, RN-006, RN-007. */
  async cadastrar(dados: DadosCadastro, ip: string): Promise<Sessao> {
    const versoesVelhas = DOCUMENTOS_ACEITE.filter(
      (documento) => dados.aceites[documento] !== VERSOES_DOCUMENTOS[documento],
    );
    if (versoesVelhas.length > 0) {
      throw new ErroDominio('TERMOS_PENDENTES', {
        detalhes: { documentos: versoesVelhas, versoesVigentes: VERSOES_DOCUMENTOS },
      });
    }
    const telefone = normalizarTelefoneBr(dados.telefone);
    if (telefone === null) throw new ErroDominio('REQUISICAO_INVALIDA');

    const agora = this.clock.agora();
    const renovacao = gerarTokenRenovacao();
    const expiraEm = somarDias(agora, VALIDADE_RENOVACAO_DIAS);
    const criada = await this.repositorio.criarConta(
      {
        nome: dados.nome,
        email: normalizarEmail(dados.email),
        telefone,
        senhaHash: await gerarHashSenha(dados.senha),
        aceites: { termos: dados.aceites.termos, privacidade: dados.aceites.privacidade },
        ip,
        testeInicio: agora,
        testeFim: somarDias(agora, DURACAO_TESTE_DIAS),
      },
      dados.dispositivo,
      { resumoRenovacao: renovacao.resumo, expiraEm },
      agora,
    );
    if (criada === null) throw new ErroDominio('EMAIL_JA_CADASTRADO');

    return this.montarSessao(criada.usuario, criada, renovacao.token, expiraEm, []);
  }

  /** Login por e-mail e senha, com limite de tentativas (RN-008). */
  async entrar(dados: DadosLogin, ip: string): Promise<Sessao> {
    const email = normalizarEmail(dados.email);
    const chaveEmail = `login:email:${resumir(email)}`;
    await this.limites.registrar(
      [
        { chave: chaveEmail, maximo: MAXIMO_TENTATIVAS_EMAIL },
        { chave: `login:ip:${ip}`, maximo: MAXIMO_TENTATIVAS_IP },
      ],
      JANELA_TENTATIVAS_SEGUNDOS,
    );

    const usuario = await this.repositorio.buscarPorEmail(email);
    const senhaConfere = await conferirSenha(usuario?.senhaHash ?? null, dados.senha);
    if (!usuario || !senhaConfere || usuario.status === 'excluido') {
      throw new ErroDominio('CREDENCIAIS_INVALIDAS');
    }
    if (usuario.status === 'bloqueado') throw new ErroDominio('CONTA_BLOQUEADA');
    await this.limites.zerar(chaveEmail);

    const agora = this.clock.agora();
    const renovacao = gerarTokenRenovacao();
    const expiraEm = somarDias(agora, VALIDADE_RENOVACAO_DIAS);
    const aberta = await this.repositorio.abrirSessao(
      usuario.id,
      dados.dispositivo,
      { resumoRenovacao: renovacao.resumo, expiraEm },
      agora,
    );
    return this.montarSessao(
      usuario,
      aberta,
      renovacao.token,
      expiraEm,
      aceitesPendentes(await this.repositorio.aceitesDoUsuario(usuario.id)),
    );
  }

  /**
   * RN-004: troca o token de renovação por um par novo. Token já usado (reuso) revoga todas as
   * sessões do aparelho, porque indica que alguém copiou o token.
   */
  async renovar(token: string): Promise<Sessao> {
    const agora = this.clock.agora();
    const sessao = await this.repositorio.buscarSessao(resumir(token));
    if (!sessao) throw new ErroDominio('SESSAO_INVALIDA');
    if (sessao.revogadaEm !== null) return this.reusoDetectado(sessao, agora);
    if (sessao.expiraEm <= agora || sessao.usuario.status === 'excluido') {
      throw new ErroDominio('SESSAO_INVALIDA');
    }
    if (sessao.usuario.status === 'bloqueado') throw new ErroDominio('CONTA_BLOQUEADA');

    const renovacao = gerarTokenRenovacao();
    const expiraEm = somarDias(agora, VALIDADE_RENOVACAO_DIAS);
    const girada = await this.repositorio.girarSessao(
      sessao,
      { resumoRenovacao: renovacao.resumo, expiraEm },
      agora,
    );
    if (girada === null) return this.reusoDetectado(sessao, agora);

    return this.montarSessao(
      sessao.usuario,
      { sessaoId: girada.sessaoId, dispositivoId: sessao.dispositivoId },
      renovacao.token,
      expiraEm,
      aceitesPendentes(await this.repositorio.aceitesDoUsuario(sessao.usuarioId)),
    );
  }

  /** Sai deste aparelho: revoga a sessão do token. Sem erro se ela já não valia. */
  async sair(token: string): Promise<void> {
    await this.repositorio.revogarPorToken(resumir(token), this.clock.agora());
  }

  /** RN-004: "Sair de todos os aparelhos". */
  async sairDeTodos(usuario: UsuarioAutenticado): Promise<void> {
    await this.repositorio.revogarDoUsuario(usuario.id, this.clock.agora());
  }

  private async reusoDetectado(
    sessao: { id: string; usuarioId: string; dispositivoId: string | null },
    agora: Date,
  ): Promise<never> {
    await this.repositorio.revogarFamilia(sessao, agora);
    this.log.warn(
      { sessaoId: sessao.id, dispositivoId: sessao.dispositivoId },
      'Reuso de token de renovação: sessões do aparelho revogadas',
    );
    throw new ErroDominio('SESSAO_INVALIDA');
  }

  private async montarSessao(
    usuario: UsuarioDaSessao,
    aberta: { sessaoId: string; dispositivoId: string | null },
    tokenRenovacao: string,
    renovacaoExpiraEm: Date,
    pendentes: Sessao['aceitesPendentes'],
  ): Promise<Sessao> {
    const acesso = await this.tokens.emitir({
      id: usuario.id,
      papel: usuario.papel,
      sessaoId: aberta.sessaoId,
      dispositivoId: aberta.dispositivoId,
    });
    return {
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        onboardingConcluido: usuario.onboardingConcluido,
      },
      tokens: {
        acesso: acesso.token,
        acessoExpiraEm: acesso.expiraEm.toISOString(),
        renovacao: tokenRenovacao,
        renovacaoExpiraEm: renovacaoExpiraEm.toISOString(),
      },
      aceitesPendentes: pendentes,
    };
  }
}
