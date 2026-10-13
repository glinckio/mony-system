package com.monitorizze.alarm

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * O sistema apaga os alarmes ao desligar o aparelho e ao atualizar o app; a liberação do alarme
 * exato troca os inexatos por exatos. Nos três casos, agenda tudo de novo a partir da agenda guardada.
 */
class ReceptorSistema : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED,
      -> AgendadorAlarmes.reagendarTudo(context)
    }
  }
}
