package com.monitorizze.alarm

/**
 * Um alarme no aparelho. O [id] vem do servidor (uma ocorrência de lembrete) e identifica o alarme
 * no `AlarmManager`; o adiado ganha um id próprio para não ser trocado pela próxima sincronização.
 */
data class Alarme(
  val id: String,
  val instanteMs: Long,
  val titulo: String,
  val corpo: String,
  val adiado: Boolean = false,
)

data class Plano(
  /** Alarmes que ficam agendados, do mais cedo para o mais tarde. */
  val agendar: List<Alarme>,
  /** Ids agendados antes que saem. */
  val cancelar: Set<String>,
  /** Recebidos e não agendados: passados, repetidos ou além do limite. */
  val descartados: Int,
)

/** Um alarme que tocou, para a PoC medir o atraso. */
data class Disparo(val id: String, val previstoMs: Long, val disparadoMs: Long, val exato: Boolean)

/**
 * Regras da agenda de alarmes, sem APIs do Android, para os testes rodarem na JVM.
 *
 * O servidor é a fonte da verdade (doc 09): cada sincronização manda a lista inteira dos próximos
 * alarmes, e o aparelho fica com ela. Só os adiados ficam de fora da troca, porque o servidor não sabe
 * deles; saem quando tocam ou passam.
 */
object PlanoAlarmes {
  /**
   * Alarmes agendados ao mesmo tempo. O Android recusa mais de 500 por app, e o iOS guarda até 64
   * notificações pendentes: 50 serve aos dois, e o app reagenda ao abrir e a cada push silencioso.
   */
  const val MAXIMO = 50

  /** Quanto o [Adiar] empurra o alarme. */
  const val ADIAMENTO_MS: Long = 10L * 60 * 1000

  private const val SUFIXO_ADIADO = ":adiado"

  fun planejar(desejados: List<Alarme>, atuais: List<Alarme>, agoraMs: Long): Plano {
    val adiados = atuais.filter { it.adiado && it.instanteMs > agoraMs }
    val vistos = mutableSetOf<String>()
    val futuros =
      desejados
        .filter { it.instanteMs > agoraMs && it.id.isNotBlank() && vistos.add(it.id) }
        .map { it.copy(adiado = false) }
        .sortedWith(compareBy<Alarme> { it.instanteMs }.thenBy { it.id })
    val cabem = (MAXIMO - adiados.size).coerceAtLeast(0)
    val agendar = (futuros.take(cabem) + adiados).sortedWith(compareBy<Alarme> { it.instanteMs }.thenBy { it.id })
    val ficam = agendar.map { it.id }.toSet()
    return Plano(
      agendar = agendar,
      cancelar = atuais.map { it.id }.filter { it !in ficam }.toSet(),
      descartados = desejados.size - (agendar.size - adiados.size),
    )
  }

  /** O alarme adiado: toca de novo [ADIAMENTO_MS] depois de agora, com id próprio. */
  fun adiar(alarme: Alarme, agoraMs: Long): Alarme =
    alarme.copy(
      id = if (alarme.adiado) alarme.id else alarme.id + SUFIXO_ADIADO,
      instanteMs = agoraMs + ADIAMENTO_MS,
      adiado = true,
    )
}
