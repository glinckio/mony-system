import { Injectable, Logger } from '@nestjs/common';
import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import type { TipoAlerta } from '@mony/shared/enums';
import {
  COTA_CONSULTORIA_DIARIA,
  MAXIMO_SEM_AGRUPAR,
  noSilencio,
  REGEX_LINK_INTERNO,
  TIPOS_ALERTA_OBRIGATORIOS,
  TIPOS_CONSULTORIA,
} from '@mony/shared/notificacoes';

import { Rotina } from '../../core/rotinas/rotinas';
import { ChatDosAlertas } from './chat-dos-alertas';
import { EnvioNotificacoes, type NotificacaoParaEnvio } from './envio-notificacoes';
import { type NotificacaoDoUsuario, NotificacoesRepository } from './notificacoes.repository';

/**
 * O que um avaliador de regra propõe (doc 09). Os avaliadores (T-082) leem os eventos e as
 * rotinas e chamam `MotorAlertas.emitir`; o motor decide se grava e se envia.
 */
export interface AlertaCandidato {
  usuarioId: string;
  tipo: TipoAlerta;
  /** RN-102: a mesma chave não gera outra notificação para o usuário. */
  chaveUnica: string;
  /** Urgente ignora o horário de silêncio (fatura atrasada, lembrete, assinatura). */
  urgente: boolean;
  titulo: string;
  corpo: string;
  /** RN-105: `mony://…`, a tela que a notificação abre. */
  linkInterno: string;
  /** Também vira mensagem da Mony no chat (T-083). */
  vaiParaChat: boolean;
  /** O texto no chat, quando é mais que o título e o corpo do push (os resumos). */
  textoChat?: string;
}

/** Por que um candidato não virou notificação. */
export type MotivoDescarte = 'desligado' | 'repetido' | 'cota_consultoria' | 'link_invalido';

export interface ResultadoEmissao {
  enviadas: string[];
  adiadas: string[];
  descartadas: { chaveUnica: string; motivo: MotivoDescarte }[];
}

/** Usuários por lote na liberação do silêncio. */
const LOTE_LIBERACAO = 200;

/** Situação de alertas de um usuário: preferências, silêncio e fuso. */
interface SituacaoDoUsuario {
  desligados: Set<TipoAlerta>;
  silencio: { inicio: string; fim: string } | null;
  fuso: string;
}

/**
 * Motor de alertas (doc 09, RN-100 a RN-105). Filtra cada candidato, nesta ordem:
 * 1. tipo desligado pelo usuário (RN-100; assinatura não desliga);
 * 2. cota diária de consultoria (RN-103);
 * 3. chave única já usada (RN-102);
 * 4. horário de silêncio (RN-101): o não urgente fica gravado e espera o fim do silêncio.
 * O que passa vai para a central e para os canais (`EnvioNotificacoes`); com `vaiParaChat`,
 * também para o chat da Mony (`ChatDosAlertas`).
 */
@Injectable()
export class MotorAlertas {
  private readonly log = new Logger(MotorAlertas.name);

  constructor(
    private readonly repositorio: NotificacoesRepository,
    private readonly envio: EnvioNotificacoes,
    private readonly chat: ChatDosAlertas,
  ) {}

  async emitir(candidatos: readonly AlertaCandidato[], agora: Date): Promise<ResultadoEmissao> {
    const resultado: ResultadoEmissao = { enviadas: [], adiadas: [], descartadas: [] };
    const porUsuario = new Map<string, AlertaCandidato[]>();
    for (const candidato of candidatos) {
      porUsuario.set(candidato.usuarioId, [
        ...(porUsuario.get(candidato.usuarioId) ?? []),
        candidato,
      ]);
    }
    for (const [usuarioId, doUsuario] of porUsuario) {
      const situacao = await this.situacao(usuarioId);
      let consultoriaHoje = await this.consultoriaDeHoje(usuarioId, situacao.fuso, agora);
      const paraEnviar: NotificacaoDoUsuario[] = [];
      for (const candidato of doUsuario) {
        const descartar = (motivo: MotivoDescarte) =>
          resultado.descartadas.push({ chaveUnica: candidato.chaveUnica, motivo });
        if (!REGEX_LINK_INTERNO.test(candidato.linkInterno)) {
          this.log.error(
            `Alerta ${candidato.chaveUnica} com link inválido: ${candidato.linkInterno}`,
          );
          descartar('link_invalido');
          continue;
        }
        if (situacao.desligados.has(candidato.tipo)) {
          descartar('desligado');
          continue;
        }
        const consultoria = TIPOS_CONSULTORIA.includes(candidato.tipo);
        if (consultoria && consultoriaHoje >= COTA_CONSULTORIA_DIARIA) {
          descartar('cota_consultoria');
          continue;
        }
        const gravada = await this.repositorio.gravarSeNova({
          usuarioId,
          tipo: candidato.tipo,
          titulo: candidato.titulo,
          corpo: candidato.corpo,
          linkInterno: candidato.linkInterno,
          chaveUnica: candidato.chaveUnica,
        });
        if (!gravada) {
          descartar('repetido');
          continue;
        }
        if (consultoria) consultoriaHoje += 1;
        // No chat, já: a mensagem não toca o aparelho, então o silêncio não segura (T-083).
        if (candidato.vaiParaChat) await this.paraOChat(candidato);
        if (!candidato.urgente && this.emSilencio(situacao, agora)) {
          resultado.adiadas.push(gravada.id);
          continue;
        }
        paraEnviar.push(gravada);
      }
      for (const notificacao of paraEnviar) {
        await this.envio.enviar({
          usuarioId,
          notificacoes: [paraEnvio(notificacao)],
          agrupada: false,
        });
      }
      await this.repositorio.marcarEnviadas(
        paraEnviar.map(({ id }) => id),
        agora,
      );
      resultado.enviadas.push(...paraEnviar.map(({ id }) => id));
    }
    return resultado;
  }

  /**
   * Rotina (doc 09, RN-101): a cada 15 minutos, envia as notificações que esperavam o fim do
   * horário de silêncio. Mais de 3 para o mesmo usuário saem agrupadas num envio só; na central
   * continuam uma a uma.
   */
  @Rotina({ nome: 'liberar-silencio', padrao: '*/15 * * * *' })
  async liberarSilencio(agora: Date): Promise<number> {
    let liberadas = 0;
    let depoisDe: string | null = null;
    for (;;) {
      const usuarios = await this.repositorio.usuariosComAdiadas(depoisDe, LOTE_LIBERACAO);
      if (usuarios.length === 0) return liberadas;
      for (const usuarioId of usuarios) {
        const situacao = await this.situacao(usuarioId);
        if (this.emSilencio(situacao, agora)) continue;
        const adiadas = await this.repositorio.adiadas(usuarioId);
        if (adiadas.length === 0) continue;
        if (adiadas.length > MAXIMO_SEM_AGRUPAR) {
          await this.envio.enviar({
            usuarioId,
            notificacoes: adiadas.map(paraEnvio),
            agrupada: true,
          });
        } else {
          for (const notificacao of adiadas) {
            await this.envio.enviar({
              usuarioId,
              notificacoes: [paraEnvio(notificacao)],
              agrupada: false,
            });
          }
        }
        await this.repositorio.marcarEnviadas(
          adiadas.map(({ id }) => id),
          agora,
        );
        liberadas += adiadas.length;
      }
      depoisDe = usuarios.at(-1) ?? null;
    }
  }

  /** A mensagem da Mony no chat; uma falha fica no log e não segura a notificação. */
  private async paraOChat(candidato: AlertaCandidato): Promise<void> {
    try {
      await this.chat.enviar(
        candidato.usuarioId,
        candidato.textoChat ?? `${candidato.titulo}\n${candidato.corpo}`,
      );
    } catch (erro) {
      const motivo = erro instanceof Error ? erro.message : String(erro);
      this.log.error(`Alerta ${candidato.chaveUnica} não foi ao chat: ${motivo}`);
    }
  }

  private async situacao(usuarioId: string): Promise<SituacaoDoUsuario> {
    const preferencias = await this.repositorio.preferencias(usuarioId);
    const comSilencio = preferencias.find(
      ({ silencioInicio, silencioFim }) => silencioInicio !== null && silencioFim !== null,
    );
    return {
      desligados: new Set(
        preferencias
          .filter(
            ({ ativo, tipoAlerta }) => !ativo && !TIPOS_ALERTA_OBRIGATORIOS.includes(tipoAlerta),
          )
          .map(({ tipoAlerta }) => tipoAlerta),
      ),
      silencio:
        comSilencio?.silencioInicio && comSilencio.silencioFim
          ? { inicio: comSilencio.silencioInicio, fim: comSilencio.silencioFim }
          : null,
      fuso: await this.repositorio.fusoDoUsuario(usuarioId),
    };
  }

  private emSilencio(situacao: SituacaoDoUsuario, agora: Date): boolean {
    return (
      situacao.silencio !== null &&
      noSilencio(horaNoFuso(agora, situacao.fuso), situacao.silencio.inicio, situacao.silencio.fim)
    );
  }

  /** Alertas de consultoria já gravados hoje, no dia do usuário (RN-103). */
  private async consultoriaDeHoje(usuarioId: string, fuso: string, agora: Date): Promise<number> {
    const hoje = dataNoFuso(agora, fuso);
    // Um dia e meio para trás cobre qualquer fuso; o dia exato é conferido no fuso do usuário.
    const desde = new Date(agora.getTime() - 36 * 60 * 60 * 1000);
    const recentes = await this.repositorio.criadasDesde(usuarioId, TIPOS_CONSULTORIA, desde);
    return recentes.filter(({ criadoEm }) => dataNoFuso(criadoEm, fuso) === hoje).length;
  }
}

function paraEnvio(notificacao: NotificacaoDoUsuario): NotificacaoParaEnvio {
  return {
    id: notificacao.id,
    tipo: notificacao.tipo,
    titulo: notificacao.titulo,
    corpo: notificacao.corpo,
    linkInterno: notificacao.linkInterno,
  };
}
