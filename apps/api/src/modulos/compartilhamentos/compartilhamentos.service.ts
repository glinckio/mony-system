import { Injectable } from '@nestjs/common';
import { normalizarEmail, normalizarTelefoneBr } from '@mony/shared/autenticacao';
import {
  type AcessoRecurso,
  type Compartilhamento,
  type DadosAtualizacaoCompartilhamento,
  type DadosNovoCompartilhamento,
  type ListaCompartilhamentos,
  MAXIMO_CONVITES_POR_HORA,
  type RecursoComConvite,
} from '@mony/shared/compartilhamentos';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { LimiteTentativas } from '../../core/limites/limite-tentativas';
import { AvisosTempoReal } from '../../core/tempo-real/avisos-tempo-real';
import {
  type CompartilhamentoGravado,
  CompartilhamentosRepository,
} from './compartilhamentos.repository';

const UMA_HORA_S = 60 * 60;

const naoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Convite não encontrado.' });

/** Como cada recurso se chama nas mensagens. */
const NOMES: Record<RecursoComConvite, { nome: string; artigo: 'a' | 'o'; esta: string }> = {
  lista: { nome: 'lista', artigo: 'a', esta: 'esta lista' },
  lembrete: { nome: 'lembrete', artigo: 'o', esta: 'este lembrete' },
};

const recursoNaoEncontrado = (recurso: RecursoComConvite) =>
  new ErroDominio('NAO_ENCONTRADO', {
    mensagem: recurso === 'lista' ? 'Lista de compras não encontrada.' : 'Lembrete não encontrado.',
  });

const chave = (recurso: RecursoComConvite, recursoId: string) => `${recurso}:${recursoId}`;

/** O que cada acesso permite: `editar` faz tudo de `ver`; o dono, tudo. */
const NIVEL: Record<AcessoRecurso, number> = { ver: 1, editar: 2, dono: 3 };

/** Quem é dono do recurso e como o usuário chega nele. */
export interface Acesso {
  donoId: string;
  acesso: AcessoRecurso;
}

/** A lista ou o lembrete compartilhado com o usuário, para `GET /listas` e `GET /lembretes`. */
export interface RecursoRecebido {
  recursoId: string;
  acesso: Exclude<AcessoRecurso, 'dono'>;
  dono: { id: string; nome: string };
}

/** Quem aceitou o convite, para receber o aviso do recurso. */
export interface ConvidadoAceito {
  usuarioId: string;
  fuso: string;
  donoNome: string;
}

/**
 * Compartilhamentos (RN-074, doc 05) de listas e lembretes: o dono convida quem tem conta (pelo
 * e-mail ou telefone) com `ver` ou `editar`; o convidado aceita ou recusa, e qualquer um dos dois
 * desfaz. As listas avisam em tempo real quem está nelas (T-124b). Os outros módulos
 * conferem o acesso por `verificarAcesso`: quem não tem acesso recebe 404 (não revela que existe);
 * quem vê mas não pode mexer, 403.
 */
@Injectable()
export class CompartilhamentosService {
  constructor(
    private readonly repositorio: CompartilhamentosRepository,
    private readonly limites: LimiteTentativas,
    private readonly avisos: AvisosTempoReal,
  ) {}

  async listar(contexto: Contexto): Promise<ListaCompartilhamentos> {
    const { recebidos, enviados } = await this.repositorio.doUsuario(usuarioDoContexto(contexto));
    const nomes = await this.repositorio.nomesDosRecursos([...recebidos, ...enviados]);
    const paraDto = (gravado: CompartilhamentoGravado) =>
      paraCompartilhamento(gravado, nomes.get(chave(gravado.recurso, gravado.recursoId)) ?? '');
    return { recebidos: recebidos.map(paraDto), enviados: enviados.map(paraDto) };
  }

  /**
   * RN-074: só o dono convida, e só quem tem conta. Convidar de novo quem recusou volta o convite a
   * pendente; quem já aceitou só muda de permissão. Até 20 convites por hora, porque a resposta diz
   * se o contato tem conta (decisão técnica).
   */
  async convidar(contexto: Contexto, dados: DadosNovoCompartilhamento): Promise<Compartilhamento> {
    const usuarioId = usuarioDoContexto(contexto);
    const recurso = await this.repositorio.recurso(dados.recurso, dados.recursoId);
    if (!recurso || recurso.usuarioId !== usuarioId) {
      if (recurso && (await this.repositorio.aceito(usuarioId, dados.recurso, dados.recursoId))) {
        const { nome, artigo } = NOMES[dados.recurso];
        throw new ErroDominio('ACESSO_NEGADO', {
          mensagem: `Só o dono d${artigo} ${nome} pode convidar.`,
        });
      }
      throw recursoNaoEncontrado(dados.recurso);
    }
    await this.limites.registrar(
      [{ chave: `convites:${usuarioId}`, maximo: MAXIMO_CONVITES_POR_HORA }],
      UMA_HORA_S,
    );
    const convidado = await this.contaDoContato(dados.contato);
    if (convidado.id === usuarioId) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: `Você já é dono d${NOMES[dados.recurso].esta}.`,
        detalhes: { campo: 'contato' },
      });
    }
    const gravado = await this.repositorio.convidar({
      usuarioId,
      recurso: dados.recurso,
      recursoId: dados.recursoId,
      convidadoId: convidado.id,
      permissao: dados.permissao,
    });
    return paraCompartilhamento(gravado, recurso.nome);
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
    if (gravado.status === 'aceito') this.acessoMudou(gravado);
    return this.comNome(gravado);
  }

  /** O dono tira a pessoa da lista, ou a pessoa sai dela; os aparelhos dela saem da sala (T-124b). */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.repositorio.buscar(id);
    if (!atual || (atual.usuarioId !== usuarioId && atual.convidadoId !== usuarioId)) {
      throw naoEncontrado();
    }
    await this.repositorio.excluir(id);
    if (atual.status === 'aceito' && atual.recurso === 'lista') {
      this.avisos.tirarDaLista(atual.convidadoId, atual.recursoId);
      this.avisos.listaMudou(atual.recursoId, 'acesso');
    }
  }

  /**
   * RN-074: como o usuário chega na lista ou no lembrete e quem é o dono. Sem acesso (ou convite não
   * aceito), 404; com acesso menor que o `exigido`, 403.
   */
  async verificarAcesso(
    usuarioId: string,
    recurso: RecursoComConvite,
    recursoId: string,
    exigido: AcessoRecurso,
  ): Promise<Acesso> {
    const gravado = await this.repositorio.recurso(recurso, recursoId);
    if (!gravado) throw recursoNaoEncontrado(recurso);
    let acesso: AcessoRecurso;
    if (gravado.usuarioId === usuarioId) {
      acesso = 'dono';
    } else {
      const convite = await this.repositorio.aceito(usuarioId, recurso, recursoId);
      if (!convite) throw recursoNaoEncontrado(recurso);
      acesso = convite.permissao;
    }
    if (NIVEL[acesso] < NIVEL[exigido]) {
      const { nome, artigo, esta } = NOMES[recurso];
      throw new ErroDominio('ACESSO_NEGADO', {
        mensagem:
          exigido === 'dono'
            ? `Só o dono d${artigo} ${nome} pode fazer isso.`
            : `Você só pode ver ${esta}.`,
      });
    }
    return { donoId: gravado.usuarioId, acesso };
  }

  /** As listas ou os lembretes compartilhados com o usuário (convites aceitos). */
  async recebidos(usuarioId: string, recurso: RecursoComConvite): Promise<RecursoRecebido[]> {
    const aceitos = await this.repositorio.aceitosDoUsuario(usuarioId, recurso);
    return aceitos.map(({ recursoId, permissao, usuario }) => ({
      recursoId,
      acesso: permissao,
      dono: usuario,
    }));
  }

  /** Quantas pessoas aceitaram cada lista ou lembrete. */
  pessoasPorRecurso(
    recurso: RecursoComConvite,
    ids: readonly string[],
  ): Promise<Map<string, number>> {
    return this.repositorio.aceitosPorRecurso(recurso, ids);
  }

  /** Para os avisos: quem aceitou cada recurso (com o fuso dele) e o nome do dono. */
  async convidadosAceitos(
    recurso: RecursoComConvite,
    ids: readonly string[],
  ): Promise<Map<string, ConvidadoAceito[]>> {
    const porRecurso = new Map<string, ConvidadoAceito[]>();
    if (ids.length === 0) return porRecurso;
    for (const { recursoId, usuario, convidado } of await this.repositorio.convidadosAceitos(
      recurso,
      ids,
    )) {
      const lista = porRecurso.get(recursoId) ?? [];
      lista.push({ usuarioId: convidado.id, fuso: convidado.fusoHorario, donoNome: usuario.nome });
      porRecurso.set(recursoId, lista);
    }
    return porRecurso;
  }

  /** A lista ou o lembrete foi apagado: os convites dele saem junto. */
  async recursoExcluido(recurso: RecursoComConvite, recursoId: string): Promise<void> {
    await this.repositorio.excluirDoRecurso(recurso, recursoId);
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
    if (para === 'aceito') this.acessoMudou(gravado);
    return this.comNome(gravado);
  }

  /** Quem está na lista vê o acesso novo na hora (T-124b); o lembrete não tem tempo real. */
  private acessoMudou(gravado: CompartilhamentoGravado): void {
    if (gravado.recurso === 'lista') this.avisos.listaMudou(gravado.recursoId, 'acesso');
  }

  private async comNome(gravado: CompartilhamentoGravado): Promise<Compartilhamento> {
    const nomes = await this.repositorio.nomesDosRecursos([gravado]);
    return paraCompartilhamento(
      gravado,
      nomes.get(chave(gravado.recurso, gravado.recursoId)) ?? '',
    );
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
