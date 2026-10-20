import { Injectable } from '@nestjs/common';
import { TIPOS_ALERTA } from '@mony/shared/enums';
import {
  type ConsultaNotificacoes,
  type DadosAtualizacaoPreferenciasAlerta,
  type Notificacao,
  type PaginaNotificacoes,
  type PreferenciasAlerta,
  TIPOS_ALERTA_OBRIGATORIOS,
} from '@mony/shared/notificacoes';

import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import {
  type NotificacaoDoUsuario,
  NotificacoesRepository,
  type PosicaoNotificacao,
} from './notificacoes.repository';

/** Central de notificações e preferências de alerta (RN-100, RN-101, RN-108; doc 09). */
@Injectable()
export class NotificacoesService {
  constructor(
    private readonly repositorio: NotificacoesRepository,
    private readonly clock: Clock,
  ) {}

  /** A central: da mais nova para a mais antiga, por cursor, com o total de não lidas. */
  async listar(contexto: Contexto, consulta: ConsultaNotificacoes): Promise<PaginaNotificacoes> {
    const usuarioId = usuarioDoContexto(contexto);
    const { cursor, limite, ...filtro } = consulta;
    const linhas = await this.repositorio.listar(
      usuarioId,
      filtro,
      cursor === undefined ? null : lerCursor(cursor),
      limite + 1,
    );
    const pagina = linhas.slice(0, limite);
    const ultima = pagina.at(-1);
    return {
      itens: pagina.map(paraNotificacao),
      proximoCursor: linhas.length > limite && ultima ? escreverCursor(ultima) : null,
      naoLidas: await this.repositorio.contarNaoLidas(usuarioId),
    };
  }

  contarNaoLidas(usuarioId: string): Promise<number> {
    return this.repositorio.contarNaoLidas(usuarioId);
  }

  /** Marcar como lida de novo não muda a hora da primeira leitura. */
  async marcarLida(contexto: Contexto, id: string): Promise<Notificacao> {
    const usuarioId = usuarioDoContexto(contexto);
    if (!(await this.repositorio.buscar(usuarioId, id))) throw new ErroDominio('NAO_ENCONTRADO');
    await this.repositorio.marcarLidas(usuarioId, [id], this.clock.agora());
    const lida = await this.repositorio.buscar(usuarioId, id);
    if (!lida) throw new ErroDominio('NAO_ENCONTRADO');
    return paraNotificacao(lida);
  }

  async marcarTodasLidas(contexto: Contexto): Promise<{ afetadas: number }> {
    const usuarioId = usuarioDoContexto(contexto);
    return { afetadas: await this.repositorio.marcarLidas(usuarioId, null, this.clock.agora()) };
  }

  /** Uma linha por tipo; tipo sem linha conta como ligado. */
  async preferencias(contexto: Contexto): Promise<PreferenciasAlerta> {
    const usuarioId = usuarioDoContexto(contexto);
    const linhas = await this.repositorio.preferencias(usuarioId);
    const porTipo = new Map(linhas.map((linha) => [linha.tipoAlerta, linha]));
    const comSilencio = linhas.find(
      ({ silencioInicio, silencioFim }) => silencioInicio !== null && silencioFim !== null,
    );
    return {
      silencio:
        comSilencio?.silencioInicio && comSilencio.silencioFim
          ? { inicio: comSilencio.silencioInicio, fim: comSilencio.silencioFim }
          : null,
      tipos: TIPOS_ALERTA.map((tipo) => {
        const desligavel = !TIPOS_ALERTA_OBRIGATORIOS.includes(tipo);
        return {
          tipo,
          ativo: !desligavel || (porTipo.get(tipo)?.ativo ?? true),
          antecedenciaDias: porTipo.get(tipo)?.antecedenciaDias ?? null,
          antecedenciaMinutos: porTipo.get(tipo)?.antecedenciaMinutos ?? null,
          desligavel,
        };
      }),
    };
  }

  /** RN-100: liga e desliga por tipo (menos assinatura); RN-101: silêncio para todos. */
  async atualizarPreferencias(
    contexto: Contexto,
    dados: DadosAtualizacaoPreferenciasAlerta,
  ): Promise<PreferenciasAlerta> {
    const usuarioId = usuarioDoContexto(contexto);
    const obrigatorios = (dados.tipos ?? []).filter(
      ({ tipo, ativo }) => ativo === false && TIPOS_ALERTA_OBRIGATORIOS.includes(tipo),
    );
    if (obrigatorios.length > 0) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Alertas de assinatura não podem ser desligados.',
        detalhes: { tipos: obrigatorios.map(({ tipo }) => tipo) },
      });
    }
    await this.repositorio.garantirPreferencias(usuarioId, TIPOS_ALERTA);
    for (const { tipo, ativo, antecedenciaDias, antecedenciaMinutos } of dados.tipos ?? []) {
      await this.repositorio.atualizarPreferencia(usuarioId, tipo, {
        ...(ativo === undefined ? {} : { ativo }),
        ...(antecedenciaDias === undefined ? {} : { antecedenciaDias }),
        ...(antecedenciaMinutos === undefined ? {} : { antecedenciaMinutos }),
      });
    }
    if (dados.silencio !== undefined) {
      await this.repositorio.definirSilencio(usuarioId, dados.silencio);
    }
    return this.preferencias(contexto);
  }
}

function paraNotificacao(notificacao: NotificacaoDoUsuario): Notificacao {
  return {
    id: notificacao.id,
    tipo: notificacao.tipo,
    titulo: notificacao.titulo,
    corpo: notificacao.corpo,
    linkInterno: notificacao.linkInterno,
    criadoEm: notificacao.criadoEm.toISOString(),
    enviadaEm: notificacao.enviadaEm?.toISOString() ?? null,
    lidaEm: notificacao.lidaEm?.toISOString() ?? null,
  };
}

/** Cursor opaco: criação e id da última da página. */
function escreverCursor(notificacao: PosicaoNotificacao): string {
  return Buffer.from(
    JSON.stringify({ c: notificacao.criadoEm.toISOString(), i: notificacao.id }),
  ).toString('base64url');
}

function lerCursor(cursor: string): PosicaoNotificacao {
  try {
    const { c, i } = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as {
      c?: unknown;
      i?: unknown;
    };
    if (
      typeof c === 'string' &&
      !Number.isNaN(Date.parse(c)) &&
      typeof i === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(i)
    ) {
      return { criadoEm: new Date(c), id: i };
    }
  } catch {
    // cai no erro abaixo
  }
  throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'Cursor inválido.' });
}
