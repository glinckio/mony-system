package com.monitorizze.appusage

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context

/** Lê os eventos de uso do sistema e devolve só os dos apps monitorados. */
internal object LeitorEventos {
  // Valores fixos do Android: ACTIVITY_RESUMED e ACTIVITY_PAUSED (API 29) são os mesmos números de
  // MOVE_TO_FOREGROUND e MOVE_TO_BACKGROUND, que valem desde a API 21.
  private const val RETOMADA = 1
  private const val PAUSA = 2

  /** Eventos de `[desdeMs, ateMs)`. Sem acesso ao uso, o sistema devolve a lista vazia. */
  fun ler(context: Context, desdeMs: Long, ateMs: Long, pacotes: Set<String>): List<EventoUso> {
    if (pacotes.isEmpty() || desdeMs >= ateMs) return emptyList()
    val gerenciador = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val eventos = gerenciador.queryEvents(desdeMs, ateMs) ?: return emptyList()
    val evento = UsageEvents.Event()
    val lista = mutableListOf<EventoUso>()
    while (eventos.hasNextEvent()) {
      eventos.getNextEvent(evento)
      val pacote = evento.packageName ?: continue
      if (pacote !in pacotes) continue
      val tipo =
        when (evento.eventType) {
          RETOMADA -> TipoEvento.FRENTE
          PAUSA -> TipoEvento.FUNDO
          else -> continue
        }
      lista += EventoUso(pacote, evento.timeStamp, tipo)
    }
    return lista
  }
}
