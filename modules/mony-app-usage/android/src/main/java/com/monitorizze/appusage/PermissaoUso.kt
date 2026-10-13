package com.monitorizze.appusage

import android.Manifest
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Process
import android.provider.Settings

/** Acesso ao uso (`PACKAGE_USAGE_STATS`): não tem diálogo, a pessoa libera nas configurações. */
internal object PermissaoUso {
  fun liberada(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    // `checkOpNoThrow` existe desde a API 19. O Android 10 o renomeou para `unsafeCheckOpNoThrow`, e o
    // SDK 36 voltou atrás: o nome novo é que está obsoleto.
    val modo = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    // MODE_DEFAULT: alguns fabricantes deixam a decisão para a permissão declarada.
    if (modo == AppOpsManager.MODE_DEFAULT) {
      return context.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) ==
        PackageManager.PERMISSION_GRANTED
    }
    return modo == AppOpsManager.MODE_ALLOWED
  }

  /**
   * Tela "Acesso ao uso". Com o pacote no `data`, o Android 10 ou mais novo abre direto na página do
   * app; quem não aceita o `data` cai na lista ([semPacote]).
   */
  fun telaDeConfiguracao(context: Context): Intent =
    Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).setData(Uri.fromParts("package", context.packageName, null))

  fun semPacote(): Intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
}
