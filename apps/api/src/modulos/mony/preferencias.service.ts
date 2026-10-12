import { Injectable, Logger } from '@nestjs/common';
import { chaveDoEstabelecimento } from '@mony/shared/rascunhos';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { type Combinacao, MonyRepository, type PreferenciaSalva } from './mony.repository';

/**
 * Preferências aprendidas (doc 08, RN-090): para cada estabelecimento (a descrição normalizada), a
 * categoria, o cartão e a forma de pagamento que a pessoa confirmou. Ordenam os botões (RN-081) e
 * entram no contexto do modelo.
 */
@Injectable()
export class PreferenciasService {
  private readonly log = new Logger(PreferenciasService.name);

  constructor(private readonly repositorio: MonyRepository) {}

  /** A preferência do estabelecimento da descrição, se houver. */
  async doEstabelecimento(
    contexto: Contexto,
    descricao: string | null,
  ): Promise<PreferenciaSalva | null> {
    const chave = descricao === null ? null : chaveDoEstabelecimento(descricao);
    if (chave === null) return null;
    return this.repositorio.preferencia(usuarioDoContexto(contexto), chave);
  }

  principais(contexto: Contexto, quantidade: number): Promise<PreferenciaSalva[]> {
    return this.repositorio.preferenciasPrincipais(usuarioDoContexto(contexto), quantidade);
  }

  /**
   * RN-090: a cada lançamento confirmado pela Mony, a combinação do estabelecimento. Falha aqui não
   * desfaz o lançamento: vai para o log.
   */
  async aprender(contexto: Contexto, descricao: string, combinacao: Combinacao): Promise<void> {
    const chave = chaveDoEstabelecimento(descricao);
    if (chave === null) return;
    try {
      await this.repositorio.aprenderPreferencia(usuarioDoContexto(contexto), chave, combinacao);
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.log.warn(`Preferência de "${chave}" não gravada: ${motivo}`);
    }
  }
}
