package com.monitorizze.alarm

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * O alarme tocando: notificação no canal `alarmes`, com o som de alarme do aparelho no volume de
 * alarme (toca no modo silencioso), repetindo até a pessoa tocar em [Parar] ou [Adiar] ou até
 * [TOQUE_MAXIMO_MS]. Com o aparelho bloqueado, abre em tela cheia quando a liberação existe.
 * RN-077: o alarme não passa pelo horário de silêncio do app.
 */
internal object NotificacaoAlarme {
  /** O canal `alarmes` do doc 04 é deste módulo: o som e a importância só valem na criação. */
  const val CANAL = "alarmes"
  const val ACAO_PARAR = "com.monitorizze.alarm.PARAR"
  const val ACAO_ADIAR = "com.monitorizze.alarm.ADIAR"
  const val EXTRA_ID = "id"
  const val EXTRA_TITULO = "titulo"
  const val EXTRA_CORPO = "corpo"

  /** Como o "silenciar depois de 10 min" dos despertadores. */
  private const val TOQUE_MAXIMO_MS: Long = 10L * 60 * 1000
  private val VIBRACAO = longArrayOf(0, 800, 600, 800, 600, 800)

  fun criarCanal(context: Context, nome: String) {
    val canal =
      NotificationChannelCompat.Builder(CANAL, NotificationManagerCompat.IMPORTANCE_HIGH)
        .setName(nome)
        .setSound(som(), AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build())
        .setVibrationEnabled(true)
        .setVibrationPattern(VIBRACAO)
        .build()
    NotificationManagerCompat.from(context).createNotificationChannel(canal)
  }

  fun notificacoesLiberadas(context: Context): Boolean =
    NotificationManagerCompat.from(context).areNotificationsEnabled() &&
      (
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
          PackageManager.PERMISSION_GRANTED
        )

  /** Tela cheia: no Android 14 ou mais novo só com a liberação da pessoa (ou de app de despertador). */
  fun telaCheiaLiberada(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()

  fun mostrar(context: Context, alarme: Alarme) {
    if (!notificacoesLiberadas(context)) return
    val textos = RegistroAlarmes(context).textos()
    criarCanal(context, textos.canal)
    val construtor =
      NotificationCompat.Builder(context, CANAL)
        .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
        .setContentTitle(alarme.titulo)
        .setContentText(alarme.corpo)
        .setStyle(NotificationCompat.BigTextStyle().bigText(alarme.corpo))
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setTimeoutAfter(TOQUE_MAXIMO_MS)
        .setVibrate(VIBRACAO)
        .addAction(0, textos.parar, acao(context, ACAO_PARAR, alarme))
        .addAction(0, textos.adiar, acao(context, ACAO_ADIAR, alarme))
    AgendadorAlarmes.abrirApp(context)?.let {
      construtor.setContentIntent(it)
      construtor.setFullScreenIntent(it, true)
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      // Sem canal no Android 7: o som vai no aviso, no volume de alarme.
      @Suppress("DEPRECATION")
      construtor.setSound(som(), AudioManager.STREAM_ALARM)
    }
    val notificacao = construtor.build()
    // Repete o som até a pessoa agir ou o tempo acabar.
    notificacao.flags = notificacao.flags or Notification.FLAG_INSISTENT
    try {
      NotificationManagerCompat.from(context).notify(idDaNotificacao(alarme.id), notificacao)
    } catch (_: SecurityException) {
      // Permissão retirada entre a conferência e o aviso.
    }
  }

  fun fechar(context: Context, id: String) {
    NotificationManagerCompat.from(context).cancel(idDaNotificacao(id))
  }

  fun idDaNotificacao(id: String): Int = id.hashCode()

  private fun som() =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: Settings.System.DEFAULT_ALARM_ALERT_URI

  private fun acao(context: Context, acao: String, alarme: Alarme): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, ReceptorAlarme::class.java)
        .setAction(acao)
        .setData(AgendadorAlarmes.dataDoAlarme(alarme.id))
        .putExtra(EXTRA_ID, alarme.id)
        .putExtra(EXTRA_TITULO, alarme.titulo)
        .putExtra(EXTRA_CORPO, alarme.corpo),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
