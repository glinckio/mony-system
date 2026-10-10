import { Injectable } from '@nestjs/common';
import type {
  Conta,
  DadosAtualizacaoConta,
  DadosNovaConta,
  ListaContas,
} from '@mony/shared/contas';
import { esquemaNovaConta } from '@mony/shared/contas';

import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { type ContaDoUsuario, ContasRepository } from './contas.repository';

/**
 * Contas bancárias e carteiras (doc 06). Contas do Open Finance chegam pela T-120: aqui só mudam
 * de nome e não são excluídas (sai desconectando o banco).
 */
@Injectable()
export class ContasService {
  constructor(private readonly repositorio: ContasRepository) {}

  async listar(contexto: Contexto): Promise<ListaContas> {
    const usuarioId = usuarioDoContexto(contexto);
    const contas = await this.repositorio.listar(usuarioId);
    return { itens: await this.comSaldo(usuarioId, contas) };
  }

  async buscar(contexto: Contexto, id: string): Promise<Conta> {
    const usuarioId = usuarioDoContexto(contexto);
    const conta = await this.repositorio.buscar(usuarioId, id);
    if (!conta) throw new ErroDominio('NAO_ENCONTRADO');
    const [resposta] = await this.comSaldo(usuarioId, [conta]);
    if (!resposta) throw new ErroDominio('NAO_ENCONTRADO');
    return resposta;
  }

  async criar(contexto: Contexto, dados: DadosNovaConta): Promise<Conta> {
    const usuarioId = usuarioDoContexto(contexto);
    const { nome, tipo, saldoInicialCentavos } = esquemaNovaConta.parse(dados);
    const conta = await this.repositorio.criar(usuarioId, {
      nome,
      tipo,
      saldoInicial: BigInt(saldoInicialCentavos),
    });
    return paraResposta(conta, { receitas: 0n, despesas: 0n });
  }

  async atualizar(contexto: Contexto, id: string, dados: DadosAtualizacaoConta): Promise<Conta> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.repositorio.buscar(usuarioId, id);
    if (!atual) throw new ErroDominio('NAO_ENCONTRADO');
    if (
      atual.origem === 'open_finance' &&
      (dados.tipo !== undefined || dados.saldoInicialCentavos !== undefined)
    ) {
      throw new ErroDominio('CONFLITO', {
        mensagem: 'Tipo e saldo de conta conectada pelo Open Finance vêm do banco.',
      });
    }
    await this.repositorio.atualizar(usuarioId, id, {
      ...(dados.nome === undefined ? {} : { nome: dados.nome }),
      ...(dados.tipo === undefined ? {} : { tipo: dados.tipo }),
      ...(dados.saldoInicialCentavos === undefined
        ? {}
        : { saldoInicial: BigInt(dados.saldoInicialCentavos) }),
    });
    return this.buscar(contexto, id);
  }

  /** Lançamentos da conta continuam, sem conta. Conta do Open Finance sai desconectando o banco. */
  async excluir(contexto: Contexto, id: string): Promise<void> {
    const usuarioId = usuarioDoContexto(contexto);
    const atual = await this.repositorio.buscar(usuarioId, id);
    if (!atual) throw new ErroDominio('NAO_ENCONTRADO');
    if (atual.origem === 'open_finance') {
      throw new ErroDominio('CONFLITO', {
        mensagem: 'Para remover uma conta do Open Finance, desconecte o banco.',
      });
    }
    await this.repositorio.excluir(usuarioId, id);
  }

  private async comSaldo(usuarioId: string, contas: ContaDoUsuario[]): Promise<Conta[]> {
    if (contas.length === 0) return [];
    const movimento = await this.repositorio.movimentoPago(
      usuarioId,
      contas.map(({ id }) => id),
    );
    return contas.map((conta) =>
      paraResposta(conta, movimento.get(conta.id) ?? { receitas: 0n, despesas: 0n }),
    );
  }
}

function paraResposta(
  conta: ContaDoUsuario,
  movimento: { receitas: bigint; despesas: bigint },
): Conta {
  return {
    id: conta.id,
    nome: conta.nome,
    tipo: conta.tipo,
    origem: conta.origem,
    saldoInicialCentavos: Number(conta.saldoInicial),
    saldoAtualCentavos: Number(conta.saldoInicial + movimento.receitas - movimento.despesas),
  };
}
