package com.monitorizze.appusage

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

internal data class AppInstalado(val pacote: String, val nome: String)

/**
 * Apps que abrem pela tela inicial. O `<queries>` do manifesto do módulo deixa o Android 11 ou mais
 * novo mostrar esses apps sem `QUERY_ALL_PACKAGES`.
 */
internal object AppsInstalados {
  fun listar(context: Context): List<AppInstalado> {
    val gerenciador = context.packageManager
    val intencao = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val atividades =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        gerenciador.queryIntentActivities(intencao, PackageManager.ResolveInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        gerenciador.queryIntentActivities(intencao, 0)
      }
    return atividades
      .map { AppInstalado(it.activityInfo.packageName, it.loadLabel(gerenciador).toString()) }
      .filter { it.pacote != context.packageName }
      .distinctBy { it.pacote }
      .sortedBy { it.nome.lowercase() }
  }

  /** Nome do app para o aviso; o pacote, se o app saiu do aparelho. */
  fun nome(context: Context, pacote: String): String =
    try {
      val gerenciador = context.packageManager
      gerenciador.getApplicationLabel(gerenciador.getApplicationInfo(pacote, 0)).toString()
    } catch (_: PackageManager.NameNotFoundException) {
      pacote
    }
}
