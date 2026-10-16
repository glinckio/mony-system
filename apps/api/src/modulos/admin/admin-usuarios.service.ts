import { Injectable } from '@nestjs/common';

import type {
  ConsultaUsuariosAdmin,
  UsuarioAdmin,
  UsuarioResumoAdmin,
  UsuariosAdmin,
} from '@mony/shared/admin';

import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { planoEfetivo } from '../planos/dominio/cotas';
import {
  AdminUsuariosRepository,
  type LinhaUsuario,
  type LinhaUsuarioCompleta,
} from './admin-usuarios.repository';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Usuários no painel (T-141a, doc 13): busca, dados da conta, bloquear e reativar, estender o teste.
 * Toda ação e toda visualização de dados de uma pessoa vão para a `auditoria`.
 */
@Injectable()
export class AdminUsuariosService {
  constructor(
    private readonly repositorio: AdminUsuariosRepository,
    private readonly clock: Clock,
  ) {}

  /** A busca com texto vai para a auditoria na primeira página (as seguintes são a mesma busca). */
  async buscar(
    adminId: string,
    consulta: ConsultaUsuariosAdmin,
    ip: string,
  ): Promise<UsuariosAdmin> {
    const linhas = await this.repositorio.buscar({ ...consulta, limite: consulta.limite + 1 });
    const pagina = linhas.slice(0, consulta.limite);
    const busca = consulta.busca?.trim();
    if (busca && !consulta.cursor) {
      await this.repositorio.auditarBusca({ adminId, ip, busca, resultados: pagina.length });
    }
    const agora = this.clock.agora();
    return {
      itens: pagina.map((linha) => this.resumo(linha, agora)),
      proximoCursor: linhas.length > consulta.limite ? (pagina.at(-1)?.id ?? null) : null,
    };
  }

  async usuario(adminId: string, id: string, ip: string): Promise<UsuarioAdmin> {
    const linha = await this.buscarOuFalhar(id);
    await this.repositorio.auditar({ adminId, ip, acao: 'usuario.visualizado', usuarioId: id });
    return this.completo(linha);
  }

  /**
   * Bloqueia o login e revoga as sessões; não apaga dados. Admin não é bloqueado pelo painel (para
   * ninguém trancar o painel por engano): o `admin:promover --rebaixar` tira o papel antes.
   */
  async bloquear(adminId: string, id: string, ip: string): Promise<UsuarioAdmin> {
    const linha = await this.buscarOuFalhar(id);
    if (linha.papel === 'admin') {
      throw new ErroDominio('CONFLITO', {
        mensagem: 'Admins não são bloqueados pelo painel. Tire o papel de admin antes.',
      });
    }
    this.recusarExcluido(linha);
    if (linha.status === 'ativo') {
      await this.repositorio.bloquear({ usuarioId: id, adminId, ip, agora: this.clock.agora() });
    }
    return this.completo(await this.buscarOuFalhar(id));
  }

  async reativar(adminId: string, id: string, ip: string): Promise<UsuarioAdmin> {
    const linha = await this.buscarOuFalhar(id);
    this.recusarExcluido(linha);
    if (linha.status === 'bloqueado') {
      await this.repositorio.reativar({ usuarioId: id, adminId, ip });
    }
    return this.completo(await this.buscarOuFalhar(id));
  }

  /**
   * Soma dias ao teste grátis: a partir do fim atual se o teste ainda vale, ou de agora se já acabou
   * (a pessoa volta ao teste). Quem tem plano pago não está em teste.
   */
  async estenderTeste(
    adminId: string,
    id: string,
    dias: number,
    ip: string,
  ): Promise<UsuarioAdmin> {
    const linha = await this.buscarOuFalhar(id);
    this.recusarExcluido(linha);
    const assinatura = linha.assinatura;
    if (!assinatura) throw new ErroDominio('NAO_ENCONTRADO');
    const agora = this.clock.agora();
    const plano = planoEfetivo(assinatura, agora);
    if (plano === 'mensal' || plano === 'anual') {
      throw new ErroDominio('CONFLITO', {
        mensagem: 'Quem tem plano pago não está em teste.',
      });
    }
    const base =
      plano === 'teste' && assinatura.testeFim && assinatura.testeFim > agora
        ? assinatura.testeFim
        : agora;
    await this.repositorio.estenderTeste({
      usuarioId: id,
      adminId,
      ip,
      antes: { plano: assinatura.plano, testeFim: assinatura.testeFim },
      testeFim: new Date(base.getTime() + dias * DIA_MS),
      dias,
    });
    return this.completo(await this.buscarOuFalhar(id));
  }

  private async buscarOuFalhar(id: string): Promise<LinhaUsuarioCompleta> {
    const linha = await this.repositorio.usuario(id, this.clock.agora());
    if (!linha) throw new ErroDominio('NAO_ENCONTRADO');
    return linha;
  }

  private recusarExcluido(linha: LinhaUsuario): void {
    if (linha.status === 'excluido') {
      throw new ErroDominio('CONFLITO', { mensagem: 'Esta conta foi excluída.' });
    }
  }

  private resumo(linha: LinhaUsuario, agora: Date): UsuarioResumoAdmin {
    return {
      id: linha.id,
      nome: linha.nome,
      email: linha.email,
      telefone: linha.telefone,
      status: linha.status,
      papel: linha.papel,
      plano: planoEfetivo(linha.assinatura, agora),
      criadoEm: linha.criadoEm.toISOString(),
      ultimoAcesso: linha.ultimoAcesso?.toISOString() ?? null,
    };
  }

  private completo(linha: LinhaUsuarioCompleta): UsuarioAdmin {
    const agora = this.clock.agora();
    const assinatura = linha.assinatura;
    return {
      ...this.resumo(linha, agora),
      fusoHorario: linha.fusoHorario,
      assinatura: assinatura
        ? {
            status: assinatura.status,
            testeFim: assinatura.testeFim?.toISOString() ?? null,
            valorCentavos: assinatura.planoPreco ? Number(assinatura.planoPreco.valor) : null,
            proximaCobranca: assinatura.proximaCobranca?.toISOString() ?? null,
            cancelamentoAgendado: assinatura.cancelamentoAgendado,
            clienteStripe: assinatura.stripeCustomerId !== null,
          }
        : null,
      aparelhos: linha.dispositivos.map((aparelho) => ({
        id: aparelho.id,
        plataforma: aparelho.plataforma,
        modelo: aparelho.modelo,
        ultimoUso: aparelho.ultimoUso?.toISOString() ?? null,
        ativo: aparelho.ativo,
      })),
      sessoesAtivas: linha.sessoesAtivas,
      loginsSociais: linha.loginsSociais.map((login) => login.provedor),
      conexoes: linha.conexoesOpenFinance.map((conexao) => ({
        id: conexao.id,
        instituicao: conexao.instituicao,
        status: conexao.status,
        criadoEm: conexao.criadoEm.toISOString(),
      })),
    };
  }
}
