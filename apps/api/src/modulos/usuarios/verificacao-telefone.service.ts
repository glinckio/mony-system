import { Injectable, Logger } from '@nestjs/common';
import type { DadosVerificacaoTelefone, Perfil } from '@mony/shared/usuario';

import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { LimiteTentativas } from '../../core/limites/limite-tentativas';
import { ErroVoz, VozProvider } from '../../integracoes/voz/voz.provider';
import {
  gerarCodigoRecuperacao,
  situacaoCodigo,
  somarMinutos,
  VALIDADE_CODIGO_MINUTOS,
} from '../autenticacao/dominio/codigos';
import {
  JANELA_TENTATIVAS_SEGUNDOS,
  MAXIMO_TENTATIVAS_EMAIL,
} from '../autenticacao/dominio/sessoes';
import { RecuperacaoSenhaRepository } from '../autenticacao/recuperacao-senha.repository';
import { conferirSenha, gerarHashSenha } from '../autenticacao/senhas';
import { UsuariosRepository } from './usuarios.repository';
import { UsuariosService } from './usuarios.service';

/**
 * Verificar o telefone (RN-078, T-122a): um código de 6 dígitos por SMS para o telefone do perfil,
 * com a validade e as tentativas do código de recuperação (RN-003). Trocar o telefone no perfil
 * tira a verificação e invalida o código pendente. A ligação do lembrete só vai para telefone
 * verificado.
 */
@Injectable()
export class VerificacaoTelefoneService {
  private readonly log = new Logger(VerificacaoTelefoneService.name);

  constructor(
    private readonly repositorio: UsuariosRepository,
    private readonly usuarios: UsuariosService,
    private readonly codigos: RecuperacaoSenhaRepository,
    private readonly voz: VozProvider,
    private readonly limites: LimiteTentativas,
    private readonly clock: Clock,
  ) {}

  /** Manda o código. Telefone já verificado não recebe outro. */
  async pedirCodigo(usuarioId: string, ip: string): Promise<void> {
    const telefone = await this.telefoneDoPerfil(usuarioId);
    if (telefone.verificado) return;
    if (!this.voz.disponivel) throw new ErroDominio('SERVICO_INDISPONIVEL');
    await this.contarTentativa(usuarioId, ip, 'pedido');
    const codigo = gerarCodigoRecuperacao();
    const agora = this.clock.agora();
    await this.codigos.criarCodigo(
      {
        usuarioId,
        finalidade: 'verificacao_telefone',
        codigoHash: await gerarHashSenha(codigo),
        expiraEm: somarMinutos(agora, VALIDADE_CODIGO_MINUTOS),
        ip,
      },
      agora,
    );
    try {
      await this.voz.enviarSms(
        telefone.numero,
        `Mony: seu código de verificação é ${codigo}. Vale por ${String(VALIDADE_CODIGO_MINUTOS)} minutos.`,
      );
    } catch (erro) {
      if (!(erro instanceof ErroVoz)) throw erro;
      this.log.warn({ usuarioId, motivo: erro.message }, 'SMS de verificação não saiu');
      throw new ErroDominio('SERVICO_INDISPONIVEL');
    }
  }

  /** Confere o código: errado conta uma tentativa (RN-003); certo verifica o telefone. */
  async verificar(usuarioId: string, dados: DadosVerificacaoTelefone, ip: string): Promise<Perfil> {
    const telefone = await this.telefoneDoPerfil(usuarioId);
    if (telefone.verificado) return this.usuarios.perfil(usuarioId);
    await this.contarTentativa(usuarioId, ip, 'confirmacao');
    const ultimo = await this.codigos.ultimoCodigo(usuarioId, 'verificacao_telefone');
    if (ultimo === null) {
      await conferirSenha(null, dados.codigo);
      throw new ErroDominio('CODIGO_INVALIDO');
    }
    if (situacaoCodigo(ultimo, this.clock.agora()) === 'expirado') {
      throw new ErroDominio('CODIGO_EXPIRADO');
    }
    if (!(await conferirSenha(ultimo.codigoHash, dados.codigo))) {
      await this.codigos.registrarErro(ultimo.id);
      throw new ErroDominio('CODIGO_INVALIDO');
    }
    if (!(await this.codigos.gastarCodigo(ultimo.id, usuarioId))) {
      throw new ErroDominio('CODIGO_EXPIRADO');
    }
    // O telefone pode ter mudado entre a conferência e aqui: aí o código não vale para o novo.
    if (
      !(await this.repositorio.marcarTelefoneVerificado(
        usuarioId,
        telefone.numero,
        this.clock.agora(),
      ))
    ) {
      throw new ErroDominio('CODIGO_EXPIRADO');
    }
    return this.usuarios.perfil(usuarioId);
  }

  private async telefoneDoPerfil(
    usuarioId: string,
  ): Promise<{ numero: string; verificado: boolean }> {
    const linha = await this.repositorio.telefone(usuarioId);
    if (!linha) throw new ErroDominio('NAO_ENCONTRADO');
    if (linha.telefone === null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Cadastre um telefone no perfil antes de verificar.',
        detalhes: { campo: 'telefone' },
      });
    }
    return { numero: linha.telefone, verificado: linha.telefoneVerificadoEm !== null };
  }

  /** RN-008: tentativas por conta e por IP, para o código não ser adivinhado nem o SMS abusado. */
  private async contarTentativa(
    usuarioId: string,
    ip: string,
    tipo: 'pedido' | 'confirmacao',
  ): Promise<void> {
    await this.limites.registrar(
      [
        { chave: `telefone:${tipo}:usuario:${usuarioId}`, maximo: MAXIMO_TENTATIVAS_EMAIL },
        { chave: `telefone:${tipo}:ip:${ip}`, maximo: MAXIMO_TENTATIVAS_EMAIL * 4 },
      ],
      JANELA_TENTATIVAS_SEGUNDOS,
    );
  }
}
