package com.monitorizze.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/** Fala com o `AlarmManager`. Cada alarme é uma `PendingIntent` com o id no `data`. */
internal object AgendadorAlarmes {
  const val ACAO_DISPARAR = "com.monitorizze.alarm.DISPARAR"
  const val EXTRA_EXATO = "exato"

  /** Alarme exato liberado? No Android 11 ou mais velho não há o que liberar. */
  fun exatoLiberado(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || gerenciador(context).canScheduleExactAlarms()

  /**
   * Cancela o que sai e (re)agenda o que fica. Sem o alarme exato, cai no `setAndAllowWhileIdle`, que
   * toca no Doze, mas pode atrasar minutos: a PoC mede quanto. Devolve se ficou exato.
   */
  fun aplicar(context: Context, plano: Plano): Boolean {
    plano.cancelar.forEach { cancelar(context, it) }
    var exato = exatoLiberado(context)
    for (alarme in plano.agendar) {
      exato = agendar(context, alarme, exato)
    }
    return exato
  }

  /** Agenda um alarme; devolve se ficou exato (a permissão pode sumir no meio). */
  fun agendar(context: Context, alarme: Alarme, exato: Boolean): Boolean {
    val gerenciador = gerenciador(context)
    if (exato) {
      try {
        gerenciador.setAlarmClock(
          AlarmManager.AlarmClockInfo(alarme.instanteMs, abrirApp(context)),
          disparo(context, alarme.id, true),
        )
        return true
      } catch (_: SecurityException) {
        // Permissão retirada entre a conferência e o agendamento: segue sem exatidão.
      }
    }
    gerenciador.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarme.instanteMs, disparo(context, alarme.id, false))
    return false
  }

  fun cancelar(context: Context, id: String) {
    val intencao = disparo(context, id, false)
    gerenciador(context).cancel(intencao)
    intencao.cancel()
  }

  /** Lê a agenda guardada e agenda de novo (depois de ligar o aparelho ou de liberar o exato). */
  fun reagendarTudo(context: Context, agoraMs: Long = System.currentTimeMillis()) {
    synchronized(RegistroAlarmes.TRAVA) {
      val registro = RegistroAlarmes(context)
      val atuais = registro.alarmes()
      val plano = PlanoAlarmes.planejar(atuais.filter { !it.adiado }, atuais, agoraMs)
      aplicar(context, plano)
      registro.salvarAlarmes(plano.agendar)
    }
  }

  /** Abre o app: o toque no ícone de alarme da barra de status e a tela cheia. */
  fun abrirApp(context: Context): PendingIntent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

  fun dataDoAlarme(id: String): Uri = Uri.Builder().scheme("mony-alarm").authority("alarme").appendPath(id).build()

  private fun disparo(context: Context, id: String, exato: Boolean): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, ReceptorAlarme::class.java)
        .setAction(ACAO_DISPARAR)
        .setData(dataDoAlarme(id))
        .putExtra(EXTRA_EXATO, exato),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private fun gerenciador(context: Context) = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
}
