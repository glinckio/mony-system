package com.monitorizze.appusage

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Aviso local só da PoC, para quem testa ver a detecção sem abrir o app. No produto, o app manda a
 * abertura para o servidor, que aplica a RN-104 e envia o push no canal `alertas` (T-121). Por isso o
 * canal é outro, e os textos ficam aqui em vez do i18n do app.
 */
internal object AvisoTeste {
  private const val CANAL = "poc-apps-de-compra"
  private const val ID = 22_022

  fun mostrar(context: Context, deteccoes: List<Deteccao>) {
    val gerenciador = NotificationManagerCompat.from(context)
    if (!gerenciador.areNotificationsEnabled()) return
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
          PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    gerenciador.createNotificationChannel(
      NotificationChannelCompat.Builder(CANAL, NotificationManagerCompat.IMPORTANCE_DEFAULT)
        .setName("Teste da detecção de apps")
        .setDescription("Avisos da prova de conceito da detecção de apps de compra")
        .build(),
    )
    val hora = SimpleDateFormat("HH:mm", Locale.forLanguageTag("pt-BR"))
    val linhas =
      deteccoes.map {
        val atraso = TimeUnit.MILLISECONDS.toMinutes(it.detectadoEmMs - it.abertoEmMs)
        "${AppsInstalados.nome(context, it.pacote)} aberto às ${hora.format(Date(it.abertoEmMs))} " +
          "(visto $atraso min depois)"
      }
    val abrirApp =
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        PendingIntent.getActivity(context, ID, it, PendingIntent.FLAG_IMMUTABLE)
      }
    val aviso =
      NotificationCompat.Builder(context, CANAL)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle("Detecção de apps (teste)")
        .setContentText(linhas.first())
        .setStyle(NotificationCompat.BigTextStyle().bigText(linhas.joinToString("\n")))
        .setContentIntent(abrirApp)
        .setAutoCancel(true)
        .build()
    try {
      gerenciador.notify(ID, aviso)
    } catch (_: SecurityException) {
      // Permissão retirada entre a conferência e o aviso.
    }
  }
}
