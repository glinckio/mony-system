import { Injectable, Logger } from '@nestjs/common';
import {
  type DadosConferenciaCodigo,
  type DadosPedidoCodigo,
  type DadosRedefinicaoSenha,
  normalizarEmail,
  type Sessao,
} from '@mony/shared/autenticacao';

import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { idDeJob } from '../../core/filas/filas';
import { LimiteTentativas } from '../../core/limites/limite-tentativas';
import { EnvioEmails } from '../../integracoes/email/envio-emails';
import { emailCodigoRecuperacao } from '../../integracoes/email/modelos/codigo-recuperacao';
import { AutenticacaoRepository, type UsuarioDaSessao } from './autenticacao.repository';
import { AutenticacaoService } from './autenticacao.service';
import {
  gerarCodigoRecuperacao,
  situacaoCodigo,
  somarMinutos,
  VALIDADE_CODIGO_MINUTOS,
} from './dominio/codigos';
import {
  JANELA_TENTATIVAS_SEGUNDOS,
  MAXIMO_TENTATIVAS_EMAIL,
  MAXIMO_TENTATIVAS_IP,
  resumir,
} from './dominio/sessoes';
import { RecuperacaoSenhaRepository } from './recuperacao-senha.repository';
import { conferirSenha, gerarHashSenha } from './senhas';

/**
 * Recuperação de senha por código de 6 dígitos enviado por e-mail (RN-003), com os limites de
 * tentativa da RN-008. O código é guardado com o mesmo Argon2id das senhas: são só um milhão de
 * valores, e o hash lento atrasa quem conseguir ler o banco.
 */
@Injectable()
export class RecuperacaoSenhaService {
  constructor(
    private readonly codigos: RecuperacaoSenhaRepository,
    private readonly contas: AutenticacaoRepository,
    private readonly autenticacao: AutenticacaoService,
    private readonly emails: EnvioEmails,
    private readonly limites: LimiteTentativas,
    private readonly clock: Clock,
  ) {}

  private readonly log = new Logger(RecuperacaoSenhaService.name);

  /**
   * Gera o código e põe o e-mail na fila. A resposta é a mesma exista a conta ou não, e o hash é
   * calculado nos dois casos, para o tempo também não revelar. Contas bloqueadas ou excluídas não
   * recebem código.
   */
  async pedirCodigo(dados: DadosPedidoCodigo, ip: string): Promise<void> {
    const email = normalizarEmail(dados.email);
    await this.limites.registrar(
      [
        { chave: `recuperacao:email:${resumir(email)}`, maximo: MAXIMO_TENTATIVAS_EMAIL },
        { chave: `recuperacao:ip:${ip}`, maximo: MAXIMO_TENTATIVAS_IP },
      ],
      JANELA_TENTATIVAS_SEGUNDOS,
    );

    const codigo = gerarCodigoRecuperacao();
    const codigoHash = await gerarHashSenha(codigo);
    const usuario = await this.contas.buscarPorEmail(email);
    if (!usuario || usuario.status !== 'ativo') return;

    const agora = this.clock.agora();
    const { id } = await this.codigos.criarCodigo(
      {
        usuarioId: usuario.id,
        codigoHash,
        expiraEm: somarMinutos(agora, VALIDADE_CODIGO_MINUTOS),
        ip,
      },
      agora,
    );
    await this.emails.enfileirar(
      emailCodigoRecuperacao({
        nome: usuario.nome,
        email: usuario.email,
        codigo,
        validadeMinutos: VALIDADE_CODIGO_MINUTOS,
      }),
      idDeJob('codigo-recuperacao', id),
    );
  }

  /** Confere o código sem gastá-lo, para o app só pedir a senha nova depois do código certo. */
  async conferirCodigo(dados: DadosConferenciaCodigo, ip: string): Promise<void> {
    await this.validarCodigo(dados.email, dados.codigo, ip);
  }

  /**
   * RN-003: troca a senha, encerra as sessões de todos os aparelhos e abre uma neste. Quem
   * esqueceu a senha costuma ter errado o login: o contador de tentativas do e-mail é zerado.
   */
  async redefinirSenha(dados: DadosRedefinicaoSenha, ip: string): Promise<Sessao> {
    const { usuario, codigoId } = await this.validarCodigo(dados.email, dados.codigo, ip);
    if (usuario.status === 'bloqueado') throw new ErroDominio('CONTA_BLOQUEADA');

    const trocada = await this.codigos.trocarSenha(
      codigoId,
      usuario.id,
      await gerarHashSenha(dados.senha),
      this.clock.agora(),
    );
    if (!trocada) throw new ErroDominio('CODIGO_EXPIRADO');
    await this.limites.zerar(`login:email:${resumir(usuario.email)}`);
    this.log.log({ usuarioId: usuario.id }, 'Senha redefinida por código; sessões encerradas');

    return this.autenticacao.iniciarSessao(usuario, dados.dispositivo);
  }

  /**
   * Confere o último código do usuário. Código errado conta uma tentativa (RN-003); código certo
   * zera o contador do e-mail (RN-008), para quem errou a digitação não ficar preso.
   */
  private async validarCodigo(
    emailDigitado: string,
    codigo: string,
    ip: string,
  ): Promise<{ usuario: UsuarioDaSessao; codigoId: string }> {
    const email = normalizarEmail(emailDigitado);
    const chaveEmail = `codigo:email:${resumir(email)}`;
    await this.limites.registrar(
      [
        { chave: chaveEmail, maximo: MAXIMO_TENTATIVAS_EMAIL },
        { chave: `codigo:ip:${ip}`, maximo: MAXIMO_TENTATIVAS_IP },
      ],
      JANELA_TENTATIVAS_SEGUNDOS,
    );

    const usuario = await this.contas.buscarPorEmail(email);
    const ultimo =
      usuario && usuario.status !== 'excluido' ? await this.codigos.ultimoCodigo(usuario.id) : null;
    if (!usuario || !ultimo) {
      await conferirSenha(null, codigo);
      throw new ErroDominio('CODIGO_INVALIDO');
    }
    if (situacaoCodigo(ultimo, this.clock.agora()) === 'expirado') {
      throw new ErroDominio('CODIGO_EXPIRADO');
    }
    if (!(await conferirSenha(ultimo.codigoHash, codigo))) {
      await this.codigos.registrarErro(ultimo.id);
      throw new ErroDominio('CODIGO_INVALIDO');
    }

    await this.limites.zerar(chaveEmail);
    return { usuario, codigoId: ultimo.id };
  }
}
