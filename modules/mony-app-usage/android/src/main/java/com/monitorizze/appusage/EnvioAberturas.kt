package com.monitorizze.appusage

import android.content.Context
import android.util.Log
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Manda a fila de aberturas para `POST /v1/eventos/app-compra-aberto` com o token de evento (T-121b,
 * doc 05, "Apps de compra"). O servidor aplica a RN-104 e manda o push; aqui só importa se chegou.
 * Roda no worker, depois da detecção e fora da trava do registro: a rede pode demorar.
 */
internal class EnvioAberturas(private val context: Context) {
  private val registro = RegistroUso(context)
  private val cofre = CofreToken(context)

  fun enviarFila(agoraMs: Long = System.currentTimeMillis()) {
    synchronized(TRAVA) {
      val credencial = cofre.ler()
      if (credencial == null) {
        // Recurso desligado: nada a mandar.
        registro.trocarFila { emptyList() }
        return
      }
      val fila = registro.trocarFila { FilaEnvio.acrescentar(it, emptyList(), agoraMs) }
      for (abertura in fila) {
        when (FilaEnvio.classificar(postar(credencial, abertura))) {
          ResultadoEnvio.ENVIADA,
          ResultadoEnvio.DESCARTADA -> registro.trocarFila { atual -> atual - abertura }
          ResultadoEnvio.TENTAR_DE_NOVO -> return
          ResultadoEnvio.TOKEN_RECUSADO -> {
            // Sair, revogar o consentimento ou perder o plano pago derruba o token (T-121a): para
            // de verificar até a pessoa ligar de novo, que pede outro token.
            cofre.apagar(recusado = true)
            registro.parar()
            registro.trocarFila { emptyList() }
            Agendamento.parar(context)
            return
          }
        }
      }
    }
  }

  /** O status HTTP, ou `null` sem resposta. */
  private fun postar(credencial: Credencial, abertura: Abertura): Int? {
    val corpo =
      JSONObject()
        .put("identificadorApp", abertura.pacote)
        .put("abertoEm", FilaEnvio.isoUtc(abertura.abertoEmMs))
        .toString()
        .toByteArray(Charsets.UTF_8)
    var conexao: HttpURLConnection? = null
    return try {
      conexao =
        (URL(credencial.urlApi.trimEnd('/') + CAMINHO).openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          connectTimeout = TEMPO_MS
          readTimeout = TEMPO_MS
          doOutput = true
          setFixedLengthStreamingMode(corpo.size)
          setRequestProperty("Content-Type", "application/json")
          setRequestProperty("Authorization", "Bearer ${credencial.token}")
          setRequestProperty("x-platform", "android")
        }
      conexao.outputStream.use { it.write(corpo) }
      val status = conexao.responseCode
      // Esvazia a resposta para a conexão poder ser reaproveitada.
      (if (status < 400) conexao.inputStream else conexao.errorStream)?.use { it.readBytes() }
      status
    } catch (erro: IOException) {
      Log.i(TAG, "Abertura fica na fila: ${erro.javaClass.simpleName}")
      null
    } finally {
      conexao?.disconnect()
    }
  }

  private companion object {
    /** Um envio por vez: a periódica e a pedida não mandam a mesma fila juntas. */
    val TRAVA = Any()
    const val TAG = "MonyAppUsage"
    const val CAMINHO = "/v1/eventos/app-compra-aberto"
    const val TEMPO_MS = 15_000
  }
}
