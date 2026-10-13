package com.monitorizze.appusage

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Worker do WorkManager. Roda numa thread de fundo do próprio WorkManager, então a verificação pode
 * bloquear (preferências e `queryEvents`). Sempre termina com sucesso: a falha fica no histórico e a
 * próxima passada lê a mesma janela de novo, sem a espera exponencial do `retry`.
 */
class VerificadorUsoWorker(context: Context, parametros: WorkerParameters) : Worker(context, parametros) {
  override fun doWork(): Result {
    val origem = inputData.getString(Agendamento.ORIGEM) ?: Historico.ORIGEM_PERIODICA
    Verificacao(applicationContext).executar(origem)
    return Result.success()
  }
}
