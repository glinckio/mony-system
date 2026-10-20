import { randomUUID } from 'node:crypto';

import type { ProvedorAgendaExterna } from '@mony/shared/agenda';

import {
  CalendarProvider,
  type ContaAgenda,
  type DadosEventoAgenda,
  ErroAgenda,
  type EventoAgenda,
  type SessaoAgenda,
} from './calendar.provider';

/** O `code` que o consentimento falso devolve. */
export const PREFIXO_CODIGO_FALSO = 'fake-';

/**
 * Agenda que fica na memória, por token de acesso (desenvolvimento e testes). O consentimento
 * volta direto para o callback com um `code` falso; código sem o prefixo é recusado. Os testes
 * mexem nos eventos com `simularEvento` e tiram o acesso com `simularRevogacao`.
 */
export class CalendarFake extends CalendarProvider {
  private readonly eventos = new Map<string, Map<string, EventoAgenda>>();
  private readonly revogados = new Set<string>();
  /** O próximo erro temporário, para testar a falha do provedor. */
  falharProxima = false;

  constructor(
    private readonly provedor: ProvedorAgendaExterna,
    readonly disponivel: boolean,
  ) {
    super();
  }

  urlConsentimento(estado: string, redirecionamento: string): string {
    const url = new URL(redirecionamento);
    url.searchParams.set('code', `${PREFIXO_CODIGO_FALSO}${this.provedor}`);
    url.searchParams.set('state', estado);
    return url.toString();
  }

  trocarCodigo(codigo: string): Promise<ContaAgenda> {
    if (!codigo.startsWith(PREFIXO_CODIGO_FALSO)) {
      return Promise.reject(new ErroAgenda('Código recusado.', 'acesso_revogado'));
    }
    const acesso = `fake-acesso-${randomUUID()}`;
    this.eventos.set(acesso, new Map());
    return Promise.resolve({
      tokens: { acesso, renovacao: `fake-renovacao-${randomUUID()}`, expiraEm: null },
      agendaPrincipal: 'principal',
    });
  }

  listarEventos(sessao: SessaoAgenda, inicio: Date, fim: Date): Promise<EventoAgenda[]> {
    return this.executar(sessao, (eventos) =>
      [...eventos.values()].filter(
        (evento) => evento.inicio < fim && (evento.fim ?? evento.inicio) >= inicio,
      ),
    );
  }

  criarEvento(sessao: SessaoAgenda, dados: DadosEventoAgenda): Promise<string> {
    return this.executar(sessao, (eventos) => {
      const idExterno = `fake-evento-${randomUUID()}`;
      eventos.set(idExterno, { idExterno, ...dados });
      return idExterno;
    });
  }

  atualizarEvento(
    sessao: SessaoAgenda,
    idExterno: string,
    dados: DadosEventoAgenda,
  ): Promise<void> {
    return this.executar(sessao, (eventos) => {
      if (!eventos.has(idExterno)) throw new ErroAgenda('Evento não existe.', 'nao_encontrado');
      eventos.set(idExterno, { idExterno, ...dados });
    });
  }

  excluirEvento(sessao: SessaoAgenda, idExterno: string): Promise<void> {
    return this.executar(sessao, (eventos) => {
      if (!eventos.delete(idExterno)) throw new ErroAgenda('Evento não existe.', 'nao_encontrado');
    });
  }

  revogar(conta: ContaAgenda): Promise<void> {
    this.revogados.add(conta.tokens.acesso);
    return Promise.resolve();
  }

  /** Testes: um evento criado ou mudado direto no provedor. */
  simularEvento(acesso: string, evento: EventoAgenda): void {
    this.eventosDe(acesso).set(evento.idExterno, evento);
  }

  /** Testes: o evento apagado direto no provedor. */
  simularExclusao(acesso: string, idExterno: string): void {
    this.eventosDe(acesso).delete(idExterno);
  }

  /** Testes: a pessoa tirou o acesso no provedor. */
  simularRevogacao(acesso: string): void {
    this.revogados.add(acesso);
  }

  /** Testes: o que está no provedor para este token. */
  eventosDe(acesso: string): Map<string, EventoAgenda> {
    let eventos = this.eventos.get(acesso);
    if (!eventos) {
      eventos = new Map();
      this.eventos.set(acesso, eventos);
    }
    return eventos;
  }

  revogado(acesso: string): boolean {
    return this.revogados.has(acesso);
  }

  private executar<T>(sessao: SessaoAgenda, acao: (eventos: Map<string, EventoAgenda>) => T) {
    const acesso = sessao.conta.tokens.acesso;
    if (this.falharProxima) {
      this.falharProxima = false;
      return Promise.reject(new ErroAgenda('Provedor fora do ar.', 'temporario'));
    }
    if (this.revogados.has(acesso)) {
      return Promise.reject(new ErroAgenda('Acesso revogado.', 'acesso_revogado'));
    }
    try {
      return Promise.resolve(acao(this.eventosDe(acesso)));
    } catch (erro) {
      return Promise.reject(erro instanceof Error ? erro : new Error(String(erro)));
    }
  }
}
