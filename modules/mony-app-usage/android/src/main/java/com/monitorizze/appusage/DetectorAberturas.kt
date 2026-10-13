package com.monitorizze.appusage

/** O que interessa à detecção nos eventos do `UsageStatsManager`. */
enum class TipoEvento {
  /** `ACTIVITY_RESUMED`: uma tela do app veio para a frente. */
  FRENTE,

  /** `ACTIVITY_PAUSED`: uma tela do app saiu da frente. */
  FUNDO,
}

data class EventoUso(val pacote: String, val instanteMs: Long, val tipo: TipoEvento)

/** Um app monitorado aberto: o que o app manda para o servidor na T-121. */
data class Abertura(val pacote: String, val abertoEmMs: Long)

data class ResultadoDeteccao(
  /** Em ordem cronológica. */
  val aberturas: List<Abertura>,
  /**
   * Último instante em que cada app monitorado foi visto (na frente ou saindo dela). Fica guardado
   * para a próxima verificação: a visita que atravessa duas janelas conta uma vez só.
   */
  val ultimoUso: Map<String, Long>,
)

/**
 * Lógica da detecção, sem APIs do Android, para os testes rodarem na JVM.
 *
 * O Android não avisa "app aberto": a verificação periódica lê os eventos de uso da janela e procura
 * os apps monitorados que vieram para a frente. Trocar de tela dentro do app, apagar e acender a
 * tela ou voltar de uma notificação também geram `ACTIVITY_RESUMED`. Por isso, só conta como abertura
 * a volta ao app depois de pelo menos [AUSENCIA_MINIMA_MS] sem vê-lo. A RN-104 (um aviso por app por
 * dia) continua no servidor.
 */
object DetectorAberturas {
  /** Ausência mínima para a volta ao app contar como abertura nova. */
  const val AUSENCIA_MINIMA_MS: Long = 30L * 60 * 1000

  /** Maior janela lida de uma vez: verificação muito atrasada não avisa abertura velha. */
  const val JANELA_MAXIMA_MS: Long = 24L * 60 * 60 * 1000

  /**
   * Começo da janela `[inicio, agora)` da próxima leitura: onde a verificação anterior parou, no
   * máximo [JANELA_MAXIMA_MS] para trás. Relógio que voltou no tempo dá janela vazia.
   */
  fun inicioDaJanela(ultimaVerificacaoMs: Long?, agoraMs: Long): Long {
    val maisAntigo = agoraMs - JANELA_MAXIMA_MS
    val inicio = if (ultimaVerificacaoMs == null) maisAntigo else maxOf(ultimaVerificacaoMs, maisAntigo)
    return minOf(inicio, agoraMs)
  }

  /**
   * As aberturas dos apps [monitorados] na janela `[desdeMs, ateMs)`. [ultimoUso] vem da verificação
   * anterior; o resultado traz o novo, só com os apps ainda monitorados.
   */
  fun detectar(
    eventos: List<EventoUso>,
    monitorados: Set<String>,
    desdeMs: Long,
    ateMs: Long,
    ultimoUso: Map<String, Long>,
    ausenciaMinimaMs: Long = AUSENCIA_MINIMA_MS,
  ): ResultadoDeteccao {
    val visto = ultimoUso.filterKeys { it in monitorados }.toMutableMap()
    val aberturas = mutableListOf<Abertura>()
    eventos
      .filter { it.pacote in monitorados && it.instanteMs >= desdeMs && it.instanteMs < ateMs }
      // No mesmo milissegundo, a saída de uma tela vem antes da entrada da outra (troca de tela).
      .sortedWith(compareBy<EventoUso> { it.instanteMs }.thenBy { if (it.tipo == TipoEvento.FUNDO) 0 else 1 })
      .forEach { evento ->
        val anterior = visto[evento.pacote]
        val voltou = anterior == null || evento.instanteMs - anterior >= ausenciaMinimaMs
        if (evento.tipo == TipoEvento.FRENTE && voltou) {
          aberturas += Abertura(evento.pacote, evento.instanteMs)
        }
        visto[evento.pacote] = maxOf(anterior ?: evento.instanteMs, evento.instanteMs)
      }
    return ResultadoDeteccao(aberturas, visto)
  }
}
