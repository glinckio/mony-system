package com.monitorizze.appusage

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
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

    AsyncFunction("listarApps") {
      AppsInstalados.listar(contexto).map { mapOf("pacote" to it.pacote, "nome" to it.nome) }
    }

    /**
     * Liga o recurso: guarda o token de evento (`POST /apps-monitorados/token-evento`) cifrado, com a
     * URL da API, e começa a verificação periódica com os apps escolhidos.
     */
    AsyncFunction("ligar") { token: String, urlApi: String, pacotes: List<String> ->
      CofreToken(contexto).gravar(Credencial(token, urlApi))
      RegistroUso(contexto).iniciar(pacotes.toSet(), System.currentTimeMillis())
      Agendamento.iniciar(contexto)
    }

    /** Troca os apps verificados sem adiar a próxima verificação. Desligado, não faz nada. */
    AsyncFunction("trocarApps") { pacotes: List<String> ->
      val registro = RegistroUso(contexto)
      if (registro.config().monitorando) registro.iniciar(pacotes.toSet(), System.currentTimeMillis())
    }

    /** Desliga neste aparelho (a tela também revoga o token no servidor) e esquece a fila. */
    AsyncFunction("desligar") {
      CofreToken(contexto).apagar(recusado = false)
      val registro = RegistroUso(contexto)
      registro.parar()
      registro.trocarFila { emptyList() }
      Agendamento.parar(contexto)
    }

    AsyncFunction("estado") {
      val config = RegistroUso(contexto).config()
      val cofre = CofreToken(contexto)
      val envio =
        when {
          config.monitorando && cofre.ler() != null -> "ligado"
          cofre.recusado() -> "recusado"
          else -> "desligado"
        }
      mapOf(
        "envio" to envio,
        "pacotes" to config.pacotes.sorted(),
        "pendentes" to RegistroUso(contexto).fila().size,
        "ultimaVerificacaoEm" to config.ultimaVerificacaoMs?.toDouble(),
        "intervaloMinutos" to Agendamento.INTERVALO_MINUTOS.toInt(),
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
