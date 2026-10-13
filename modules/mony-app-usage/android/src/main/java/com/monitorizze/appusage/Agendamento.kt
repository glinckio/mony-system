package com.monitorizze.appusage

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/** Agenda a verificação no WorkManager, que sobrevive ao fechamento do app e à reinicialização. */
internal object Agendamento {
  const val ORIGEM = "origem"

  /** Menor intervalo que o WorkManager aceita para trabalho periódico. */
  const val INTERVALO_MINUTOS = 15L

  private const val PERIODICA = "mony-app-usage-periodica"
  private const val MANUAL = "mony-app-usage-agora"

  /** `UPDATE` mantém o relógio do agendamento que já existe: trocar os apps não adia a próxima. */
  fun iniciar(context: Context) {
    val pedido =
      PeriodicWorkRequestBuilder<VerificadorUsoWorker>(INTERVALO_MINUTOS, TimeUnit.MINUTES)
        .setInputData(workDataOf(ORIGEM to Historico.ORIGEM_PERIODICA))
        .build()
    WorkManager.getInstance(context)
      .enqueueUniquePeriodicWork(PERIODICA, ExistingPeriodicWorkPolicy.UPDATE, pedido)
  }

  fun parar(context: Context) {
    WorkManager.getInstance(context).cancelUniqueWork(PERIODICA)
  }

  fun verificarAgora(context: Context) {
    val pedido =
      OneTimeWorkRequestBuilder<VerificadorUsoWorker>()
        .setInputData(workDataOf(ORIGEM to Historico.ORIGEM_MANUAL))
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork(MANUAL, ExistingWorkPolicy.REPLACE, pedido)
  }

  /** Quando o WorkManager pretende rodar a próxima periódica (pode atrasar pelo Doze). */
  fun proximaExecucaoMs(context: Context): Long? =
    WorkManager.getInstance(context)
      .getWorkInfosForUniqueWork(PERIODICA)
      .get()
      .firstOrNull { it.state == WorkInfo.State.ENQUEUED || it.state == WorkInfo.State.RUNNING }
      ?.nextScheduleTimeMillis
      ?.takeIf { it != Long.MAX_VALUE }
}
