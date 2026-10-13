package com.monitorizze.alarm

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** Um alarme como o JS manda: instante em ms desde 1970. */
class AlarmeJs : Record {
  @Field val id: String = ""

  @Field val instante: Double = 0.0

  @Field val titulo: String = ""

  @Field val corpo: String = ""
}

class TextosJs : Record {
  @Field val canal: String = "Alarmes"

  @Field val parar: String = "Parar"

  @Field val adiar: String = "Adiar 10 min"
}

/**
 * Alarmes locais no Android (docs/arquitetura/04 e 09). No JS: `requireOptionalNativeModule
 * ('MonyAlarm')`, em `apps/mobile/src/lib/alarmes.ts`. As funções que abrem telas do sistema rodam
 * na thread principal; as outras, fora da thread do JS.
 */
class MonyAlarmModule : Module() {
  private val contexto: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("MonyAlarm")

    AsyncFunction("permissoes") {
      mapOf(
        "alarmeExato" to AgendadorAlarmes.exatoLiberado(contexto),
        "notificacoes" to NotificacaoAlarme.notificacoesLiberadas(contexto),
        "telaCheia" to NotificacaoAlarme.telaCheiaLiberada(contexto),
      )
    }

    // "Alarmes e lembretes" (Android 12 ou mais novo). Abaixo disso não há o que liberar.
    AsyncFunction("abrirConfiguracaoAlarmeExato") { promise: Promise ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        abrir(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pacote()))
      }
      promise.resolve(null)
    }.runOnQueue(Queues.MAIN)

    // Tela cheia (Android 14 ou mais novo).
    AsyncFunction("abrirConfiguracaoTelaCheia") { promise: Promise ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        abrir(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pacote()))
      }
      promise.resolve(null)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("abrirConfiguracaoDeNotificacoes") { promise: Promise ->
      abrir(
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, contexto.packageName)
        } else {
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pacote())
        },
      )
      promise.resolve(null)
    }.runOnQueue(Queues.MAIN)

    /** Troca a agenda pela lista recebida (o servidor é a fonte da verdade); os adiados ficam. */
    AsyncFunction("sincronizar") { alarmes: List<AlarmeJs>, textos: TextosJs ->
      val registro = RegistroAlarmes(contexto)
      registro.salvarTextos(TextosAlarme(textos.canal, textos.parar, textos.adiar))
      NotificacaoAlarme.criarCanal(contexto, textos.canal)
      synchronized(RegistroAlarmes.TRAVA) {
        val desejados = alarmes.map { Alarme(it.id, it.instante.toLong(), it.titulo, it.corpo) }
        val plano = PlanoAlarmes.planejar(desejados, registro.alarmes(), System.currentTimeMillis())
        val exato = AgendadorAlarmes.aplicar(contexto, plano)
        registro.salvarAlarmes(plano.agendar)
        mapOf("agendados" to plano.agendar.size, "descartados" to plano.descartados, "exato" to exato)
      }
    }

    AsyncFunction("estado") {
      val registro = RegistroAlarmes(contexto)
      mapOf(
        "alarmes" to
          registro.alarmes().map {
            mapOf(
              "id" to it.id,
              "instante" to it.instanteMs.toDouble(),
              "titulo" to it.titulo,
              "corpo" to it.corpo,
              "adiado" to it.adiado,
            )
          },
        "disparos" to
          registro.disparos().map {
            mapOf(
              "id" to it.id,
              "previsto" to it.previstoMs.toDouble(),
              "disparado" to it.disparadoMs.toDouble(),
              "exato" to it.exato,
            )
          },
      )
    }

    AsyncFunction("limparHistorico") { RegistroAlarmes(contexto).limparDisparos() }
  }

  private fun pacote(): Uri = Uri.fromParts("package", contexto.packageName, null)

  /** Pela atividade atual, quando há; senão, numa tarefa nova. Tela que o aparelho não tem é ignorada. */
  private fun abrir(intencao: Intent) {
    try {
      val atividade = appContext.currentActivity
      if (atividade != null) {
        atividade.startActivity(intencao)
      } else {
        contexto.startActivity(intencao.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    } catch (_: ActivityNotFoundException) {
      // Alguns fabricantes tiram telas de configuração.
    }
  }
}
