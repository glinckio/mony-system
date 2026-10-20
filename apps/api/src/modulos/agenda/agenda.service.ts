import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  type AgendaConectada,
  type AgendaDoPeriodo,
  type Compromisso,
  type ConsultaAgenda,
  type DadosAtualizacaoCompromisso,
  type DadosNovoCompromisso,
  type LinkConexaoAgenda,
  type ListaAgendas,
  PROVEDORES_AGENDA_EXTERNA,
  type ProvedorAgendaExterna,
  type ResultadoConexaoAgenda,
} from '@mony/shared/agenda';
import { LINKS_INTERNOS } from '@mony/shared/alertas';
import type { Queue } from 'bullmq';

import { Clock } from '../../core/clock/clock';
import { Configuracao } from '../../core/config/configuracao';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { Cifra, ErroCifra } from '../../core/cripto/cifra';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { FILAS, idDeJob } from '../../core/filas/filas';
import { Rotina } from '../../core/rotinas/rotinas';
import { ProvedoresAgenda } from '../../integracoes/agenda/agenda.module';
import {
  type CalendarProvider,
  type ContaAgenda,
  type DadosEventoAgenda,
  ErroAgenda,
  type SessaoAgenda,
} from '../../integracoes/agenda/calendar.provider';
import { type AgendaGravada, AgendaRepository, type CompromissoGravado } from './agenda.repository';

export const JOB_SINCRONIZAR_AGENDA = 'sincronizar-agenda';

/** O job da fila `agenda`: a conexão a sincronizar. */
export interface DadosJobSincronizarAgenda {
  agendaId: string;
}

/** O consentimento no provedor tem 10 minutos para voltar. */
const VALIDADE_ESTADO_MS = 10 * 60_000;
/** A sincronização olha 30 dias para trás e 180 para a frente. */
const DIAS_ANTES = 30;
const DIAS_DEPOIS = 180;
const DIA_MS = 86_400_000;
/** A rotina roda a cada 15 minutos (doc 09); um job por agenda por rodada. */
const RODADA_MS = 15 * 60_000;

interface EstadoConexao {
  usuarioId: string;
  provedor: ProvedorAgendaExterna;
  expiraEm: number;
}

const ehProvedorExterno = (valor: unknown): valor is ProvedorAgendaExterna =>
  (PROVEDORES_AGENDA_EXTERNA as readonly unknown[]).includes(valor);

const naoEncontrado = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Compromisso não encontrado.' });

const agendaNaoEncontrada = () =>
  new ErroDominio('NAO_ENCONTRADO', { mensagem: 'Agenda não encontrada.' });

const fimAntesDoInicio = () =>
  new ErroDominio('REQUISICAO_INVALIDA', {
    mensagem: 'O fim vem depois do início.',
    detalhes: { campo: 'fim' },
  });

function paraAgenda(linha: AgendaGravada): AgendaConectada {
  return {
    id: linha.id,
    provedor: linha.provedor,
    padrao: linha.agendaPadrao !== null,
    situacao: linha.desconectadaEm === null ? 'conectada' : 'reconectar',
    sincronizadaEm: linha.sincronizadaEm?.toISOString() ?? null,
    conectadaEm: linha.criadoEm.toISOString(),
  };
}

function paraCompromisso(linha: CompromissoGravado): Compromisso {
  return {
    id: linha.id,
    titulo: linha.titulo,
    inicio: linha.inicio.toISOString(),
    fim: linha.fim?.toISOString() ?? null,
    local: linha.local,
    origem: linha.origem,
    editavel: linha.origem !== 'externo',
    agenda: linha.agenda,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

/**
 * Agenda (T-085a, RN-079, doc 10): conectar o Google e o Outlook por OAuth no servidor, a agenda
 * padrão, os compromissos e a sincronização de 15 em 15 minutos. Os tokens ficam só cifrados
 * (`Cifra`, doc 11). Os compromissos externos são só leitura; os do app e da Mony vão para a
 * agenda padrão e, sem ela, ficam só no Mony.
 */
@Injectable()
export class AgendaService {
  private readonly log = new Logger(AgendaService.name);

  constructor(
    private readonly repositorio: AgendaRepository,
    private readonly provedores: ProvedoresAgenda,
    private readonly cifra: Cifra,
    private readonly config: Configuracao,
    private readonly clock: Clock,
    @InjectQueue(FILAS.agenda) private readonly fila: Queue<DadosJobSincronizarAgenda>,
  ) {}

  /** O endereço do consentimento; o `state` cifrado leva quem pediu e vale 10 minutos. */
  conectar(contexto: Contexto, provedor: ProvedorAgendaExterna): LinkConexaoAgenda {
    const usuarioId = usuarioDoContexto(contexto);
    const calendario = this.provedores.de(provedor);
    if (!calendario.disponivel || !this.cifra.disponivel) {
      throw new ErroDominio('SERVICO_INDISPONIVEL', {
        mensagem: 'Conectar agendas ainda não está disponível.',
      });
    }
    const estado: EstadoConexao = {
      usuarioId,
      provedor,
      expiraEm: this.clock.agora().getTime() + VALIDADE_ESTADO_MS,
    };
    return {
      url: calendario.urlConsentimento(this.cifra.cifrar(JSON.stringify(estado)), this.retorno()),
    };
  }

  /**
   * A volta do consentimento (rota pública, aberta no navegador): grava os tokens cifrados, pede a
   * primeira sincronização e devolve o link do app com o resultado.
   */
  async concluirConexao(consulta: {
    code?: unknown;
    state?: unknown;
    error?: unknown;
  }): Promise<string> {
    const estado = this.lerEstado(consulta.state);
    if (estado === null) return LINKS_INTERNOS.agenda('erro');
    if (consulta.error !== undefined) return LINKS_INTERNOS.agenda('cancelado');
    if (typeof consulta.code !== 'string' || consulta.code === '') {
      return LINKS_INTERNOS.agenda('erro');
    }
    if (!(await this.repositorio.usuarioAtivo(estado.usuarioId))) {
      return LINKS_INTERNOS.agenda('erro');
    }
    let resultado: ResultadoConexaoAgenda = 'sucesso';
    try {
      const conta = await this.provedores
        .de(estado.provedor)
        .trocarCodigo(consulta.code, this.retorno());
      const agenda = await this.repositorio.gravarConexao(
        estado.usuarioId,
        estado.provedor,
        this.cifra.cifrar(JSON.stringify(conta)),
        conta.agendaPrincipal,
      );
      await this.pedirSincronizacao(agenda.id);
      this.log.log({ usuarioId: estado.usuarioId, provedor: estado.provedor }, 'Agenda conectada');
    } catch (erro) {
      if (!(erro instanceof ErroAgenda)) throw erro;
      this.log.warn(`Conexão da agenda ${estado.provedor} recusada: ${erro.message}`);
      resultado = 'erro';
    }
    return LINKS_INTERNOS.agenda(resultado);
  }

  async listarAgendas(contexto: Contexto): Promise<ListaAgendas> {
    const linhas = await this.repositorio.listarAgendas(usuarioDoContexto(contexto));
    return { itens: linhas.map(paraAgenda) };
  }

  /** RN-079: onde os compromissos novos vão; `null`, só no Mony. */
  async definirPadrao(contexto: Contexto, agendaId: string | null): Promise<ListaAgendas> {
    const usuarioId = usuarioDoContexto(contexto);
    if (agendaId === null) {
      await this.repositorio.definirPadrao(usuarioId, null);
    } else {
      const agenda = await this.repositorio.buscarAgenda(usuarioId, agendaId);
      if (!agenda) throw agendaNaoEncontrada();
      if (agenda.desconectadaEm !== null) {
        throw new ErroDominio('CONFLITO', {
          mensagem: 'Conecte esta agenda de novo antes de usá-la como padrão.',
        });
      }
      const conta = this.contaDe(agenda);
      await this.repositorio.definirPadrao(usuarioId, {
        id: agenda.id,
        agenda: conta?.agendaPrincipal ?? 'principal',
      });
    }
    return this.listarAgendas(contexto);
  }

  /**
   * Desconectar: revoga o acesso no provedor (se falhar, só registra) e tira os compromissos
   * externos; os criados no app ou pela Mony ficam, só no Mony.
   */
  async desconectar(contexto: Contexto, agendaId: string): Promise<void> {
    const agenda = await this.repositorio.buscarAgenda(usuarioDoContexto(contexto), agendaId);
    if (!agenda) throw agendaNaoEncontrada();
    await this.revogarNoProvedor(agenda);
    await this.repositorio.removerAgenda(agenda.id);
  }

  /** RN-161: na exclusão da conta, revoga todas as agendas no provedor antes de apagar os dados. */
  async revogarTodas(usuarioId: string): Promise<void> {
    for (const agenda of await this.repositorio.listarAgendas(usuarioId)) {
      await this.revogarNoProvedor(agenda);
      await this.repositorio.removerAgenda(agenda.id);
    }
  }

  async agendaDoPeriodo(contexto: Contexto, consulta: ConsultaAgenda): Promise<AgendaDoPeriodo> {
    const linhas = await this.repositorio.compromissosDoPeriodo(
      usuarioDoContexto(contexto),
      new Date(consulta.inicio),
      new Date(consulta.fim),
    );
    return { itens: linhas.map(paraCompromisso) };
  }

  async buscarCompromisso(contexto: Contexto, id: string): Promise<Compromisso> {
    const linha = await this.repositorio.buscarCompromisso(usuarioDoContexto(contexto), id);
    if (!linha) throw naoEncontrado();
    return paraCompromisso(linha);
  }

  /**
   * RN-079: vai para a agenda padrão. Sem padrão, ou com o acesso revogado no provedor, fica só no
   * Mony. A Mony cria pelo mesmo caminho (`origem: 'mony'`, T-086b).
   */
  async criarCompromisso(contexto: Contexto, dados: DadosNovoCompromisso): Promise<Compromisso> {
    const usuarioId = usuarioDoContexto(contexto);
    const evento: DadosEventoAgenda = {
      titulo: dados.titulo,
      inicio: new Date(dados.inicio),
      fim: dados.fim ? new Date(dados.fim) : null,
      local: dados.local ?? null,
    };
    const padrao = await this.repositorio.agendaPadrao(usuarioId);
    let destino: { agendaId: string; idExterno: string } | null = null;
    if (padrao) {
      const idExterno = await this.noProvedor(padrao, (calendario, sessao) =>
        calendario.criarEvento(sessao, evento),
      );
      if (idExterno !== null) destino = { agendaId: padrao.id, idExterno };
    }
    const criado = await this.repositorio.criarCompromisso({
      usuarioId,
      origem: contexto.origem === 'mony' ? 'mony' : 'app',
      evento,
      agendaId: destino?.agendaId ?? null,
      idExterno: destino?.idExterno ?? null,
    });
    return paraCompromisso(criado);
  }

  /** RN-079: só os do app e da Mony; a mudança vai junto para o provedor. */
  async atualizarCompromisso(
    contexto: Contexto,
    id: string,
    dados: DadosAtualizacaoCompromisso,
  ): Promise<Compromisso> {
    const atual = await this.editavel(contexto, id);
    const evento: DadosEventoAgenda = {
      titulo: dados.titulo ?? atual.titulo,
      inicio: dados.inicio === undefined ? atual.inicio : new Date(dados.inicio),
      fim: dados.fim === undefined ? atual.fim : dados.fim === null ? null : new Date(dados.fim),
      local: dados.local === undefined ? atual.local : dados.local,
    };
    if (evento.fim !== null && evento.fim <= evento.inicio) throw fimAntesDoInicio();
    let soNoMony = false;
    const agenda = await this.agendaDoCompromisso(atual);
    if (agenda && atual.idExterno !== null) {
      const idExterno = atual.idExterno;
      const mudou = await this.noProvedor(
        agenda,
        async (calendario, sessao) => {
          await calendario.atualizarEvento(sessao, idExterno, evento);
          return true;
        },
        { naoEncontrado: () => null },
      );
      // Apagado lá ou acesso revogado: fica só no Mony.
      soNoMony = mudou === null;
    }
    const gravado = await this.repositorio.atualizarCompromisso(id, {
      ...evento,
      ...(soNoMony ? { agendaId: null, idExterno: null } : {}),
    });
    return paraCompromisso(gravado);
  }

  /** RN-079: só os do app e da Mony; sai também do provedor. */
  async excluirCompromisso(contexto: Contexto, id: string): Promise<void> {
    const atual = await this.editavel(contexto, id);
    const agenda = await this.agendaDoCompromisso(atual);
    if (agenda && atual.idExterno !== null) {
      const idExterno = atual.idExterno;
      await this.noProvedor(
        agenda,
        async (calendario, sessao) => {
          await calendario.excluirEvento(sessao, idExterno);
          return true;
        },
        { naoEncontrado: () => true },
      );
    }
    await this.repositorio.excluirCompromisso(id);
  }

  /** A cada 15 minutos (doc 09): uma sincronização por agenda conectada na fila `agenda`. */
  @Rotina({ nome: 'sincronizar-agendas', padrao: '*/15 * * * *' })
  async agendarSincronizacoes(agora: Date): Promise<{ enfileiradas: number }> {
    const ids = await this.repositorio.paraSincronizar();
    const rodada = Math.floor(agora.getTime() / RODADA_MS);
    for (const agendaId of ids) await this.pedirSincronizacao(agendaId, rodada);
    return { enfileiradas: ids.length };
  }

  /**
   * No worker: espelha os eventos do período (30 dias para trás, 180 para a frente). Acesso
   * revogado no provedor deixa a agenda em `reconectar`; falha temporária lança, para a fila tentar
   * de novo.
   */
  async sincronizar(agendaId: string): Promise<void> {
    const agenda = await this.repositorio.agendaPorId(agendaId);
    if (!agenda || agenda.desconectadaEm !== null || !ehProvedorExterno(agenda.provedor)) return;
    const sessao = this.sessaoDe(agenda);
    if (sessao === null) return;
    const agora = this.clock.agora();
    const periodo = {
      inicio: new Date(agora.getTime() - DIAS_ANTES * DIA_MS),
      fim: new Date(agora.getTime() + DIAS_DEPOIS * DIA_MS),
    };
    try {
      const eventos = await this.provedores
        .de(agenda.provedor)
        .listarEventos(sessao, periodo.inicio, periodo.fim);
      const { gravados, removidos } = await this.repositorio.espelhar(
        agenda,
        eventos,
        periodo,
        agora,
      );
      this.log.log({ agendaId, gravados, removidos }, 'Agenda sincronizada');
    } catch (erro) {
      if (erro instanceof ErroAgenda && erro.motivo === 'acesso_revogado') {
        await this.repositorio.marcarDesconectada(agenda.id, agora);
        this.log.warn({ agendaId }, 'Agenda recusou os tokens: fica em reconectar');
        return;
      }
      throw erro;
    }
  }

  private async pedirSincronizacao(
    agendaId: string,
    rodada = Math.floor(this.clock.agora().getTime() / RODADA_MS),
  ): Promise<void> {
    await this.fila.add(
      JOB_SINCRONIZAR_AGENDA,
      { agendaId },
      { jobId: idDeJob(JOB_SINCRONIZAR_AGENDA, agendaId, rodada) },
    );
  }

  private async editavel(contexto: Contexto, id: string): Promise<CompromissoGravado> {
    const atual = await this.repositorio.buscarCompromisso(usuarioDoContexto(contexto), id);
    if (!atual) throw naoEncontrado();
    if (atual.origem === 'externo') throw new ErroDominio('COMPROMISSO_SO_LEITURA');
    return atual;
  }

  private async agendaDoCompromisso(
    compromisso: CompromissoGravado,
  ): Promise<AgendaGravada | null> {
    if (compromisso.agendaId === null) return null;
    const agenda = await this.repositorio.agendaPorId(compromisso.agendaId);
    return agenda && agenda.desconectadaEm === null ? agenda : null;
  }

  /**
   * Uma chamada ao provedor da agenda. Acesso revogado marca a agenda para reconectar e devolve
   * `null` (o compromisso fica só no Mony); evento que não existe mais segue `naoEncontrado`; falha
   * temporária vira `AGENDA_INDISPONIVEL`.
   */
  private async noProvedor<T>(
    agenda: AgendaGravada,
    chamada: (calendario: CalendarProvider, sessao: SessaoAgenda) => Promise<T>,
    tratar: { naoEncontrado?: () => T | null } = {},
  ): Promise<T | null> {
    if (!ehProvedorExterno(agenda.provedor)) return null;
    const sessao = this.sessaoDe(agenda);
    if (sessao === null) return null;
    try {
      return await chamada(this.provedores.de(agenda.provedor), sessao);
    } catch (erro) {
      if (!(erro instanceof ErroAgenda)) throw erro;
      if (erro.motivo === 'acesso_revogado') {
        await this.repositorio.marcarDesconectada(agenda.id, this.clock.agora());
        return null;
      }
      if (erro.motivo === 'nao_encontrado' && tratar.naoEncontrado) return tratar.naoEncontrado();
      throw new ErroDominio('AGENDA_INDISPONIVEL');
    }
  }

  private async revogarNoProvedor(agenda: AgendaGravada): Promise<void> {
    const conta = this.contaDe(agenda);
    if (conta === null || !ehProvedorExterno(agenda.provedor)) return;
    try {
      await this.provedores.de(agenda.provedor).revogar(conta);
    } catch (erro) {
      // O acesso sai daqui de qualquer jeito; o token deixa de existir junto com a linha.
      this.log.warn(
        `Revogar a agenda ${agenda.id} no provedor falhou: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  private sessaoDe(agenda: AgendaGravada): SessaoAgenda | null {
    const conta = this.contaDe(agenda);
    if (conta === null) return null;
    return {
      conta,
      aoRenovar: async (tokens) => {
        await this.repositorio.trocarTokens(
          agenda.id,
          this.cifra.cifrar(JSON.stringify({ ...conta, tokens })),
        );
      },
    };
  }

  private contaDe(agenda: AgendaGravada): ContaAgenda | null {
    if (agenda.tokensCifrados === null || !this.cifra.disponivel) return null;
    try {
      return JSON.parse(this.cifra.decifrar(agenda.tokensCifrados)) as ContaAgenda;
    } catch (erro) {
      if (!(erro instanceof ErroCifra)) throw erro;
      this.log.error(`Tokens da agenda ${agenda.id} não decifram`);
      return null;
    }
  }

  private lerEstado(valor: unknown): EstadoConexao | null {
    if (typeof valor !== 'string' || !this.cifra.disponivel) return null;
    try {
      const estado = JSON.parse(this.cifra.decifrar(valor)) as Partial<EstadoConexao>;
      if (
        typeof estado.usuarioId !== 'string' ||
        !ehProvedorExterno(estado.provedor) ||
        typeof estado.expiraEm !== 'number' ||
        estado.expiraEm < this.clock.agora().getTime()
      ) {
        return null;
      }
      return { usuarioId: estado.usuarioId, provedor: estado.provedor, expiraEm: estado.expiraEm };
    } catch {
      return null;
    }
  }

  private retorno(): string {
    return `${this.config.urlPublicaApi}/v1/agendas/oauth/callback`;
  }
}
