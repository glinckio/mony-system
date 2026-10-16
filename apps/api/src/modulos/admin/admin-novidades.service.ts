import { Injectable } from '@nestjs/common';
import type { NovaNovidade, NovidadeAdmin } from '@mony/shared/admin';
import { dataNoFuso, inicioDoDiaNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';

import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { situacaoDaNovidade } from '../novidades/dominio/novidades';
import {
  AdminNovidadesRepository,
  type DadosNovidade,
  type LinhaNovidade,
} from './admin-novidades.repository';

/** Folga para "agora" no agendamento: o relógio do navegador pode estar um pouco atrás. */
const FOLGA_AGENDAMENTO_MS = 60_000;

/**
 * Novidades do painel (T-141d, doc 13): rascunho, publicar na hora ou agendar, editar e desativar.
 * A validade é o último dia, em São Paulo; o banco guarda o instante em que deixa de valer. O push,
 * quando pedido, sai pela rotina `enviar-push-novidades` assim que a novidade entra no ar.
 */
@Injectable()
export class AdminNovidadesService {
  constructor(
    private readonly repositorio: AdminNovidadesRepository,
    private readonly clock: Clock,
  ) {}

  async novidades(): Promise<NovidadeAdmin[]> {
    const agora = this.clock.agora();
    return (await this.repositorio.novidades()).map((linha) => this.paraAdmin(linha, agora));
  }

  async criar(adminId: string, nova: NovaNovidade, ip: string): Promise<NovidadeAdmin> {
    const id = await this.repositorio.criar({ ...this.dados(nova), adminId, ip });
    return this.buscar(id);
  }

  async editar(
    adminId: string,
    id: string,
    nova: NovaNovidade,
    ip: string,
  ): Promise<NovidadeAdmin> {
    const linha = await this.buscarOuFalhar(id);
    this.recusarDesativada(linha);
    const depois = this.dados(nova);
    if (linha.publicadaEm && depois.validade && depois.validade <= linha.publicadaEm) {
      throw this.validadeAntesDaPublicacao();
    }
    await this.repositorio.editar(id, this.dadosDaLinha(linha), depois, { adminId, ip });
    return this.buscar(id);
  }

  /** Publica agora ou agenda. A que já está no ar não muda de data (desative e crie outra). */
  async publicar(
    adminId: string,
    id: string,
    publicarEm: string | null,
    ip: string,
  ): Promise<NovidadeAdmin> {
    const agora = this.clock.agora();
    const linha = await this.buscarOuFalhar(id);
    this.recusarDesativada(linha);
    const situacao = situacaoDaNovidade(linha, agora);
    if (situacao === 'no_ar' || situacao === 'vencida') {
      throw new ErroDominio('CONFLITO', { mensagem: 'Esta novidade já foi ao ar.' });
    }
    const quando = publicarEm === null ? agora : new Date(publicarEm);
    if (quando.getTime() < agora.getTime() - FOLGA_AGENDAMENTO_MS) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'A data de publicação não pode ser no passado.',
        detalhes: { campo: 'publicarEm' },
      });
    }
    const publicadaEm = quando < agora ? agora : quando;
    if (linha.validade && linha.validade <= publicadaEm) throw this.validadeAntesDaPublicacao();
    await this.repositorio.publicar(id, publicadaEm, { adminId, ip });
    return this.buscar(id);
  }

  /** Tira do app. Desativar de novo não faz nada. */
  async desativar(adminId: string, id: string, ip: string): Promise<NovidadeAdmin> {
    const linha = await this.buscarOuFalhar(id);
    if (linha.status !== 'arquivada') await this.repositorio.desativar(id, { adminId, ip });
    return this.buscar(id);
  }

  private dados(nova: NovaNovidade): DadosNovidade {
    if (nova.validade !== null && nova.validade < dataNoFuso(this.clock.agora())) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'A validade não pode ser antes de hoje.',
        detalhes: { campo: 'validade' },
      });
    }
    return {
      titulo: nova.titulo,
      descricao: nova.descricao,
      videoUrl: nova.videoUrl,
      validade: nova.validade === null ? null : inicioDoDiaNoFuso(somarDias(nova.validade, 1)),
      enviarPush: nova.enviarPush,
    };
  }

  private dadosDaLinha(linha: LinhaNovidade): DadosNovidade {
    return {
      titulo: linha.titulo,
      descricao: linha.descricao,
      videoUrl: linha.videoUrl,
      validade: linha.validade,
      enviarPush: linha.enviarPush,
    };
  }

  private validadeAntesDaPublicacao(): ErroDominio {
    return new ErroDominio('REQUISICAO_INVALIDA', {
      mensagem: 'A validade precisa ser depois da publicação.',
      detalhes: { campo: 'validade' },
    });
  }

  private recusarDesativada(linha: LinhaNovidade): void {
    if (linha.status === 'arquivada') {
      throw new ErroDominio('CONFLITO', { mensagem: 'Esta novidade foi desativada.' });
    }
  }

  private async buscarOuFalhar(id: string): Promise<LinhaNovidade> {
    const linha = await this.repositorio.novidade(id);
    if (!linha) throw new ErroDominio('NAO_ENCONTRADO');
    return linha;
  }

  private async buscar(id: string): Promise<NovidadeAdmin> {
    return this.paraAdmin(await this.buscarOuFalhar(id), this.clock.agora());
  }

  private paraAdmin(linha: LinhaNovidade, agora: Date): NovidadeAdmin {
    return {
      id: linha.id,
      titulo: linha.titulo,
      descricao: linha.descricao,
      videoUrl: linha.videoUrl,
      // O último dia em que vale: o dia antes do instante em que deixa de valer.
      validade: linha.validade ? dataNoFuso(new Date(linha.validade.getTime() - 1)) : null,
      enviarPush: linha.enviarPush,
      pushEnviadoEm: linha.pushEnviadoEm?.toISOString() ?? null,
      situacao: situacaoDaNovidade(linha, agora),
      publicadaEm: linha.publicadaEm?.toISOString() ?? null,
      autor: linha.autor,
      criadoEm: linha.criadoEm.toISOString(),
    };
  }
}
