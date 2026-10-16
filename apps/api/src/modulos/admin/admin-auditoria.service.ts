import { Injectable } from '@nestjs/common';
import type {
  AuditoriaAdmin,
  ConsultaAuditoriaAdmin,
  FiltrosAuditoriaAdmin,
  RegistroAuditoriaAdmin,
} from '@mony/shared/admin';
import { inicioDoDiaNoFuso } from '@mony/shared/datas';
import { somarDias } from '@mony/shared/recorrencias';

import { AdminAuditoriaRepository, type LinhaAuditoria } from './admin-auditoria.repository';

/** O que o registro guarda em `antes` e `depois` é sempre um objeto; outro valor vira `{ valor }`. */
function comoObjeto(valor: unknown): Record<string, unknown> | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object' && !Array.isArray(valor)) return valor as Record<string, unknown>;
  return { valor };
}

/**
 * O registro de auditoria no painel (T-141c, doc 13): toda ação e visualização de dados que os admins
 * fizeram, da mais nova à mais antiga, com filtros. Só leitura: consultar a auditoria não é gravado.
 */
@Injectable()
export class AdminAuditoriaService {
  constructor(private readonly repositorio: AdminAuditoriaRepository) {}

  async registros(consulta: ConsultaAuditoriaAdmin): Promise<AuditoriaAdmin> {
    const linhas = await this.repositorio.registros({
      ...(consulta.adminId ? { adminId: consulta.adminId } : {}),
      ...(consulta.acao ? { acao: consulta.acao } : {}),
      ...(consulta.entidade ? { entidade: consulta.entidade } : {}),
      ...(consulta.entidadeId ? { entidadeId: consulta.entidadeId } : {}),
      // Dias de São Paulo, os dois inclusos: do começo de `de` ao começo do dia seguinte a `ate`.
      ...(consulta.de ? { desde: inicioDoDiaNoFuso(consulta.de) } : {}),
      ...(consulta.ate ? { ate: inicioDoDiaNoFuso(somarDias(consulta.ate, 1)) } : {}),
      ...(consulta.cursor ? { cursor: consulta.cursor } : {}),
      limite: consulta.limite + 1,
    });
    const pagina = linhas.slice(0, consulta.limite);
    return {
      itens: pagina.map((linha) => this.registro(linha)),
      proximoCursor: linhas.length > consulta.limite ? (pagina.at(-1)?.id ?? null) : null,
    };
  }

  filtros(): Promise<FiltrosAuditoriaAdmin> {
    return this.repositorio.filtros();
  }

  private registro(linha: LinhaAuditoria): RegistroAuditoriaAdmin {
    return {
      id: linha.id,
      admin: linha.usuario,
      acao: linha.acao,
      entidade: linha.entidade,
      entidadeId: linha.entidadeId,
      antes: comoObjeto(linha.antes),
      depois: comoObjeto(linha.depois),
      ip: linha.ip,
      criadoEm: linha.criadoEm.toISOString(),
    };
  }
}
