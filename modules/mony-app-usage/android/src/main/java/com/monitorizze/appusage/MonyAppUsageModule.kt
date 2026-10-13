package com.monitorizze.appusage

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Detecção de apps de compra no Android (docs/arquitetura/10). No JS: `requireOptionalNativeModule
 * ('MonyAppUsage')`, em `apps/mobile/src/lib/uso-de-apps.ts`. As funções assíncronas rodam fora da
 * thread do JS; as que abrem telas do sistema, na principal.
 */
class MonyAppUsageModule : Module() {
  private val contexto: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MonyAppUsage")

    AsyncFunction("acessoAoUsoLiberado") { PermissaoUso.liberada(contexto) }

    AsyncFunction("abrirConfiguracaoDoAcesso") { promise: Promise ->
      try {
        abrir(PermissaoUso.telaDeConfiguracao(contexto))
      } catch (_: ActivityNotFoundException) {
        abrir(PermissaoUso.semPacote())
      }
      promise.resolve(null)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("notificacoesLigadas") { NotificationManagerCompat.from(contexto).areNotificationsEnabled() }

    AsyncFunction("abrirConfiguracaoDeNotificacoes") { promise: Promise ->
      val intencao =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, contexto.packageName)
        } else {
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            .setData(android.net.Uri.fromParts("package", contexto.packageName, null))
        }
      abrir(intencao)
      promise.resolve(null)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("listarApps") {
      AppsInstalados.listar(contexto).map { mapOf("pacote" to it.pacote, "nome" to it.nome) }
    }

    AsyncFunction("iniciar") { pacotes: List<String> ->
      RegistroUso(contexto).iniciar(pacotes.toSet(), System.currentTimeMillis())
      Agendamento.iniciar(contexto)
    }

    AsyncFunction("parar") {
      RegistroUso(contexto).parar()
      Agendamento.parar(contexto)
    }

    AsyncFunction("verificarAgora") { Agendamento.verificarAgora(contexto) }

    AsyncFunction("limparHistorico") { RegistroUso(contexto).limparHistorico() }

    AsyncFunction("estado") {
      val registro = RegistroUso(contexto)
      val config = registro.config()
      mapOf(
        "monitorando" to config.monitorando,
        "pacotes" to config.pacotes.sorted(),
        "ultimaVerificacaoEm" to config.ultimaVerificacaoMs?.toDouble(),
        "proximaVerificacaoEm" to
          (if (config.monitorando) Agendamento.proximaExecucaoMs(contexto)?.toDouble() else null),
        "intervaloMinutos" to Agendamento.INTERVALO_MINUTOS.toInt(),
        "execucoes" to
          registro.execucoes().map {
            mapOf(
              "inicioEm" to it.inicioMs.toDouble(),
              "origem" to it.origem,
              "acessoAoUso" to it.permissao,
              "desde" to it.desdeMs.toDouble(),
              "ate" to it.ateMs.toDouble(),
              "eventos" to it.eventos,
              "aberturas" to it.aberturas,
              "duracaoMs" to it.duracaoMs.toDouble(),
              "erro" to it.erro,
            )
          },
        "deteccoes" to
          registro.deteccoes().map {
            mapOf(
              "pacote" to it.pacote,
              "nome" to AppsInstalados.nome(contexto, it.pacote),
              "abertoEm" to it.abertoEmMs.toDouble(),
              "detectadoEm" to it.detectadoEmMs.toDouble(),
            )
          },
      )
    }
  }

  /** Pela atividade atual, quando há; senão, numa tarefa nova. */
  private fun abrir(intencao: Intent) {
    val atividade = appContext.currentActivity
    if (atividade != null) {
      atividade.startActivity(intencao)
    } else {
      contexto.startActivity(intencao.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
