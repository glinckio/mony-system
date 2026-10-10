import { Injectable } from '@nestjs/common';
import { type DataCalendario, dataNoFuso } from '@mony/shared/datas';
import type {
  Aporte,
  DadosAtualizacaoMeta,
  DadosNovaMeta,
  DadosNovoAporte,
  DetalheMeta,
  ListaMetas,
  Meta,
  RespostaAporte,
} from '@mony/shared/metas';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { paraDataDoBanco } from '../transacoes/transacoes.repository';
import { type AporteDaMeta, type MetaDoUsuario, MetasRepository } from './metas.repository';

/** Metas de economia (RN-063). O valor atual é a soma dos aportes. */
@Injectable()
export class MetasService {
  constructor(
    private readonly repositorio: MetasRepository,
    private readonly clock: Clock,
  ) {}

  async listar(contexto: Contexto): Promise<ListaMetas> {
    const usuarioId = usuarioDoContexto(contexto);
    return { itens: (await this.repositorio.listar(usuarioId)).map(paraMeta) };
  }

  async buscar(contexto: Contexto, id: string): Promise<DetalheMeta> {
    const usuarioId = usuarioDoContexto(contexto);
    const meta = await this.exigir(usuarioId, id);
    const aportes = await this.repositorio.aportes(usuarioId, id);
    return { ...paraMeta(meta), aportes: aportes.map(paraAporte) };
  }

  async criar(contexto: Contexto, dados: DadosNovaMeta): Promise<Meta> {
    const usuarioId = usuarioDoContexto(contexto);
    const meta = await this.repositorio.criar({
      usuarioId,
      titulo: dados.titulo,
      valorAlvo: BigInt(dados.valorAlvoCentavos),
      prazo: dados.prazo === undefined ? null : paraDataDoBanco(dados.prazo),
    });
    return paraMeta(meta);
  }

  /** RN-063: muda o que veio; a meta pode ser concluída, ou reaberta, a qualquer momento. */
  async atualizar(contexto: Contexto, id: string, dados: DadosAtualizacaoMeta): Promise<Meta> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.exigir(usuarioId, id);
    const meta = await this.repositorio.atualizar(usuarioId, id, {
      ...(dados.titulo === undefined ? {} : { titulo: dados.titulo }),
      ...(dados.valorAlvoCentavos === undefined
        ? {}
        : { valorAlvo: BigInt(dados.valorAlvoCentavos) }),
      ...(dados.prazo === undefined
        ? {}
        : { prazo: dados.prazo === null ? null : paraDataDoBanco(dados.prazo) }),
      ...(dados.concluida === undefined ? {} : { concluida: dados.concluida }),
    });
    return paraMeta(meta);
  }

  /** Apaga a meta e os aportes dela. */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    await this.exigir(usuarioId, id);
    await this.repositorio.excluir(usuarioId, id);
  }

  /**
   * RN-063: registra o aporte e refaz o valor atual. Quando o aporte faz a meta chegar ao alvo e
   * ela não está concluída, a resposta sugere concluir (a Mony pergunta).
   */
  async aportar(
    contexto: Contexto,
    metaId: string,
    dados: DadosNovoAporte,
  ): Promise<RespostaAporte> {
    const usuarioId = usuarioDoContexto(contexto);
    const hoje = await this.hoje(usuarioId);
    const data = dados.data ?? hoje;
    if (data > hoje) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'O aporte não pode ter data futura.',
        detalhes: { campos: ['data'] },
      });
    }
    const antes = await this.exigir(usuarioId, metaId);
    const feito = await this.repositorio.emAportes(usuarioId, metaId, (tx) =>
      this.repositorio.criarAporte(tx, {
        usuarioId,
        metaId,
        valor: BigInt(dados.valorCentavos),
        data: paraDataDoBanco(data),
      }),
    );
    if (!feito) throw new ErroDominio('NAO_ENCONTRADO');
    const meta = paraMeta(feito.meta);
    return {
      meta,
      aporte: paraAporte(feito.resultado),
      sugerirConclusao:
        !meta.concluida &&
        meta.valorAtualCentavos >= meta.valorAlvoCentavos &&
        antes.valorAtual < antes.valorAlvo,
    };
  }

  /** Tira um aporte lançado por engano e refaz o valor atual. */
  async excluirAporte(contexto: Contexto, metaId: string, aporteId: string): Promise<Meta> {
    const usuarioId = usuarioDoContexto(contexto);
    const feito = await this.repositorio.emAportes(usuarioId, metaId, (tx) =>
      this.repositorio.excluirAporte(tx, metaId, aporteId),
    );
    if (!feito?.resultado) throw new ErroDominio('NAO_ENCONTRADO');
    return paraMeta(feito.meta);
  }

  private async exigir(usuarioId: string, id: string): Promise<MetaDoUsuario> {
    const meta = await this.repositorio.buscar(usuarioId, id);
    if (!meta) throw new ErroDominio('NAO_ENCONTRADO');
    return meta;
  }

  private async hoje(usuarioId: string): Promise<DataCalendario> {
    return dataNoFuso(this.clock.agora(), await this.repositorio.fusoDoUsuario(usuarioId));
  }
}

function paraMeta(meta: MetaDoUsuario): Meta {
  const alvo = Number(meta.valorAlvo);
  const atual = Number(meta.valorAtual);
  return {
    id: meta.id,
    titulo: meta.titulo,
    valorAlvoCentavos: alvo,
    valorAtualCentavos: atual,
    restanteCentavos: Math.max(0, alvo - atual),
    percentual: alvo > 0 ? Math.floor((atual * 100) / alvo) : 0,
    prazo: meta.prazo?.toISOString().slice(0, 10) ?? null,
    concluida: meta.concluida,
  };
}

function paraAporte(aporte: AporteDaMeta): Aporte {
  return {
    id: aporte.id,
    valorCentavos: Number(aporte.valor),
    data: aporte.data.toISOString().slice(0, 10),
    criadoEm: aporte.criadoEm.toISOString(),
  };
}
