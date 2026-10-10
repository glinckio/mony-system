import { Injectable } from '@nestjs/common';
import { normalizarTelefoneBr } from '@mony/shared/autenticacao';
import type {
  DadosAtualizacaoOnboarding,
  DadosAtualizacaoPerfil,
  DadosRegistroDispositivo,
  EtapaOnboarding,
  Onboarding,
  Perfil,
} from '@mony/shared/usuario';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { chaveDica, chaveEtapa, montarOnboarding } from './dominio/onboarding';
import { UsuariosRepository } from './usuarios.repository';

/** Perfil, aparelho e onboarding do usuário logado (docs/arquitetura/04 e 05). */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly repositorio: UsuariosRepository,
    private readonly clock: Clock,
  ) {}

  async perfil(usuarioId: string): Promise<Perfil> {
    const usuario = await this.repositorio.perfil(usuarioId);
    if (!usuario) throw new ErroDominio('NAO_ENCONTRADO');
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      telefoneVerificado: usuario.telefoneVerificadoEm !== null,
      fotoUrl: usuario.fotoUrl,
      fusoHorario: usuario.fusoHorario,
      onboardingConcluido: usuario.onboardingConcluido,
      temSenha: usuario.senhaHash !== null,
      loginsSociais: usuario.loginsSociais.map(({ provedor }) => provedor),
      criadoEm: usuario.criadoEm.toISOString(),
    };
  }

  /** `PATCH /me`. Telefone em E.164 (RN-001); trocar o telefone tira a verificação (RN-078). */
  async atualizarPerfil(usuarioId: string, dados: DadosAtualizacaoPerfil): Promise<Perfil> {
    let telefone: string | undefined;
    if (dados.telefone !== undefined) {
      const normalizado = normalizarTelefoneBr(dados.telefone);
      if (normalizado === null) throw new ErroDominio('REQUISICAO_INVALIDA');
      telefone = normalizado;
    }
    await this.repositorio.atualizarPerfil(usuarioId, {
      ...(dados.nome === undefined ? {} : { nome: dados.nome }),
      ...(telefone === undefined ? {} : { telefone }),
      ...(dados.fusoHorario === undefined ? {} : { fusoHorario: dados.fusoHorario }),
    });
    return this.perfil(usuarioId);
  }

  /** Token de push do aparelho desta sessão (doc 09). */
  async registrarDispositivo(
    usuario: UsuarioAutenticado,
    dados: DadosRegistroDispositivo,
  ): Promise<void> {
    if (usuario.dispositivoId === null) throw new ErroDominio('REQUISICAO_INVALIDA');
    const registrado = await this.repositorio.registrarPush(
      usuario.id,
      usuario.dispositivoId,
      {
        tokenPush: dados.tokenPush,
        ...(dados.modelo === undefined ? {} : { modelo: dados.modelo }),
      },
      this.clock.agora(),
    );
    if (!registrado) throw new ErroDominio('NAO_ENCONTRADO');
  }

  async onboarding(usuarioId: string): Promise<Onboarding> {
    const perfil = await this.repositorio.perfil(usuarioId);
    if (!perfil) throw new ErroDominio('NAO_ENCONTRADO');
    return montarOnboarding(perfil.onboardingConcluido, await this.repositorio.marcas(usuarioId));
  }

  /** `PATCH /me/onboarding`: marca etapas, dicas vistas e o fim do fluxo inicial. */
  async atualizarOnboarding(
    usuarioId: string,
    dados: DadosAtualizacaoOnboarding,
  ): Promise<Onboarding> {
    const chaves = [
      ...Object.entries(dados.etapas ?? {}).map(([etapa, situacao]) =>
        chaveEtapa(etapa as EtapaOnboarding, situacao),
      ),
      ...(dados.dicasVistas ?? []).map(chaveDica),
    ];
    const { concluido } = await this.repositorio.registrarMarcas(
      usuarioId,
      chaves,
      dados.concluido,
      this.clock.agora(),
    );
    return montarOnboarding(concluido, await this.repositorio.marcas(usuarioId));
  }

  /**
   * Para outros módulos marcarem uma etapa quando ela acontece de fato (ex.: o primeiro
   * lançamento, na T-037).
   */
  async concluirEtapa(usuarioId: string, etapa: EtapaOnboarding): Promise<void> {
    await this.repositorio.registrarMarcas(
      usuarioId,
      [chaveEtapa(etapa, 'concluida')],
      undefined,
      this.clock.agora(),
    );
  }
}
