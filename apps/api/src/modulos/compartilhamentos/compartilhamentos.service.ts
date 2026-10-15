import { Injectable } from '@nestjs/common';
import { normalizarEmail, normalizarTelefoneBr } from '@mony/shared/autenticacao';
import {
  type AcessoLista,
  type Compartilhamento,
  type DadosAtualizacaoCompartilhamento,
  type DadosNovoCompartilhamento,
  type ListaCompartilhamentos,
  MAXIMO_CONVITES_POR_HORA,
} from '@mony/shared/compartilhamentos';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { LimiteTentativas } from '../../core/limites/limite-tentativas';
import {
  type CompartilhamentoGravado,
  CompartilhamentosRepository,
} from './compartilhamentos.repository';

const UMA_HORA_S = 60 * 60;

const naoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Convite não encontrado.' });

const listaNaoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Lista de compras não encontrada.' });

/** O que cada acesso permite: `editar` faz tudo de `ver`; o dono, tudo. */
const NIVEL: Record<AcessoLista, number> = { ver: 1, editar: 2, dono: 3 };

/** Quem é dono do recurso e como o usuário chega nele. */
export interface Acesso {
  donoId: string;
  acesso: AcessoLista;
}

/** A lista compartilhada com o usuário, para `GET /listas`. */
export interface ListaRecebida {
  listaId: string;
  acesso: Exclude<AcessoLista, 'dono'>;
  dono: { id: string; nome: string };
}

/**
 * Compartilhamentos (RN-074, doc 05): o dono convida quem tem conta (pelo e-mail ou telefone) com
 * `ver` ou `editar`; o convidado aceita ou recusa, e qualquer um dos dois desfaz. Os outros módulos
 * conferem o acesso por `verificarAcesso`: quem não tem acesso recebe 404 (não revela que existe);
 * quem vê mas não pode mexer, 403.
 */
@Injectable()
export class CompartilhamentosService {
  constructor(
    private readonly repositorio: CompartilhamentosRepository,
    private readonly limites: LimiteTentativas,
  ) {}

  async listar(contexto: Contexto): Promise<ListaCompartilhamentos> {
    const { recebidos, enviados } = await this.repositorio.doUsuario(usuarioDoContexto(contexto));
    const nomes = await this.repositorio.nomesDasListas(
      [...recebidos, ...enviados].map(({ recursoId }) => recursoId),
    );
    const paraDto = (gravado: CompartilhamentoGravado) =>
      paraCompartilhamento(gravado, nomes.get(gravado.recursoId) ?? '');
    return { recebidos: recebidos.map(paraDto), enviados: enviados.map(paraDto) };
  }

  /**
   * RN-074: só o dono convida, e só quem tem conta. Convidar de novo quem recusou volta o convite a
   * pendente; quem já aceitou só muda de permissão. Até 20 convites por hora, porque a resposta diz
   * se o contato tem conta (decisão técnica).
   */
  async convidar(contexto: Contexto, dados: DadosNovoCompartilhamento): Promise<Compartilhamento> {
    const usuarioId = usuarioDoContexto(contexto);
    const lista = await this.repositorio.lista(dados.recursoId);
    if (!lista || lista.usuarioId !== usuarioId) {
      if (lista && (await this.repositorio.aceito(usuarioId, dados.recursoId))) {
        throw new ErroDominio('ACESSO_NEGADO', { mensagem: 'Só o dono da lista pode convidar.' });
      }
      throw listaNaoEncontrada();
    }
    await this.limites.registrar(
      [{ chave: `convites:${usuarioId}`, maximo: MAXIMO_CONVITES_POR_HORA }],
      UMA_HORA_S,
    );
    const convidado = await this.contaDoContato(dados.contato);
    if (convidado.id === usuarioId) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Você já é dono desta lista.',
        detalhes: { campo: 'contato' },
      });
    }
    const gravado = await this.repositorio.convidar({
      usuarioId,
      recursoId: dados.recursoId,
      convidadoId: convidado.id,
      permissao: dados.permissao,
    });
    return paraCompartilhamento(gravado, lista.nome);
  }

  async aceitar(contexto: Contexto, id: string): Promise<Compartilhamento> {
    return this.responder(contexto, id, 'aceito');
  }

  async recusar(contexto: Contexto, id: string): Promise<Compartilhamento> {
    return this.responder(contexto, id, 'recusado');
  }

  /** O dono muda a permissão. */
  async atualizar(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoCompartilhamento,
  ): Promise<Compartilhamento> {
    const atual = await this.repositorio.buscar(id);
    if (!atual || atual.usuarioId !== usuarioDoContexto(contexto)) throw naoEncontrado();
    const gravado = await this.repositorio.mudarPermissao(id, dados.permissao);
    return this.comNome(gravado);
  }

  /** O dono tira a pessoa da lista, ou a pessoa sai dela. */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.repositorio.buscar(id);
    if (!atual || (atual.usuarioId !== usuarioId && atual.convidadoId !== usuarioId)) {
      throw naoEncontrado();
    }
    await this.repositorio.excluir(id);
  }

  /**
   * RN-074: como o usuário chega na lista e quem é o dono. Sem acesso (ou convite não aceito), 404;
   * com acesso menor que o `exigido`, 403.
   */
  async verificarAcesso(
    usuarioId: string,
    recurso: 'lista',
    recursoId: string,
    exigido: AcessoLista,
  ): Promise<Acesso> {
    const lista = await this.repositorio.lista(recursoId);
    if (!lista) throw listaNaoEncontrada();
    let acesso: AcessoLista;
    if (lista.usuarioId === usuarioId) {
      acesso = 'dono';
    } else {
      const convite = await this.repositorio.aceito(usuarioId, recursoId);
      if (!convite) throw listaNaoEncontrada();
      acesso = convite.permissao;
    }
    if (NIVEL[acesso] < NIVEL[exigido]) {
      throw new ErroDominio('ACESSO_NEGADO', {
        mensagem:
          exigido === 'dono'
            ? 'Só o dono da lista pode fazer isso.'
            : 'Você só pode ver esta lista.',
      });
    }
    return { donoId: lista.usuarioId, acesso };
  }

  /** As listas compartilhadas com o usuário (convites aceitos). */
  async listasRecebidas(usuarioId: string): Promise<ListaRecebida[]> {
    const aceitos = await this.repositorio.aceitosDoUsuario(usuarioId);
    return aceitos.map(({ recursoId, permissao, usuario }) => ({
      listaId: recursoId,
      acesso: permissao,
      dono: usuario,
    }));
  }

  /** Quantas pessoas aceitaram cada lista. */
  pessoasPorLista(listaIds: readonly string[]): Promise<Map<string, number>> {
    return this.repositorio.aceitosPorLista(listaIds);
  }

  /** A lista foi apagada: os convites dela saem junto. */
  async recursoExcluido(recursoId: string): Promise<void> {
    await this.repositorio.excluirDoRecurso(recursoId);
  }

  private async responder(
    contexto: Contexto,
    id: string,
    para: 'aceito' | 'recusado',
  ): Promise<Compartilhamento> {
    const atual = await this.repositorio.buscar(id);
    if (!atual || atual.convidadoId !== usuarioDoContexto(contexto)) throw naoEncontrado();
    if (atual.status === para) return this.comNome(atual);
    const gravado = await this.repositorio.mudarStatus(id, 'pendente', para);
    if (!gravado) {
      throw new ErroDominio('CONFLITO', {
        mensagem:
          atual.status === 'aceito'
            ? 'Você já aceitou este convite.'
            : 'Este convite foi recusado; peça um novo ao dono da lista.',
      });
    }
    return this.comNome(gravado);
  }

  private async comNome(gravado: CompartilhamentoGravado): Promise<Compartilhamento> {
    const nomes = await this.repositorio.nomesDasListas([gravado.recursoId]);
    return paraCompartilhamento(gravado, nomes.get(gravado.recursoId) ?? '');
  }

  /** A conta do e-mail (ou do telefone, se só uma conta tem esse número). */
  private async contaDoContato(contato: string): Promise<{ id: string; nome: string }> {
    const telefone = contato.includes('@') ? null : normalizarTelefoneBr(contato);
    const contas = await this.repositorio.contasDoContato(
      telefone === null ? { email: normalizarEmail(contato) } : { telefone },
    );
    const [conta] = contas;
    if (!conta) {
      throw new ErroDominio('NAO_ENCONTRADO', {
        mensagem: 'Não achamos uma conta com esse contato. A pessoa precisa ter conta no Mony.',
        detalhes: { campo: 'contato' },
      });
    }
    if (contas.length > 1) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Mais de uma conta usa esse telefone: convide pelo e-mail.',
        detalhes: { campo: 'contato' },
      });
    }
    return conta;
  }
}

function paraCompartilhamento(
  gravado: CompartilhamentoGravado,
  recursoNome: string,
): Compartilhamento {
  if (gravado.recurso !== 'lista') throw new Error(`recurso sem convite: ${gravado.recurso}`);
  return {
    id: gravado.id,
    recurso: gravado.recurso,
    recursoId: gravado.recursoId,
    recursoNome,
    permissao: gravado.permissao,
    status: gravado.status,
    dono: gravado.usuario,
    convidado: gravado.convidado,
    criadoEm: gravado.criadoEm.toISOString(),
  };
}
