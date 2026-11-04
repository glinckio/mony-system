package com.monitorizze.appusage

import android.content.Context
import android.util.Log

/**
 * Uma passada da verificação: lê os eventos desde a anterior, acha as aberturas, põe na fila e manda
 * ao servidor (T-121b). Roda no worker (periódica, ou a pedida ao ligar o recurso), sem o JS.
 */
internal class Verificacao(private val context: Context) {
  private val registro = RegistroUso(context)

  fun executar(origem: String, agoraMs: Long = System.currentTimeMillis()) {
    // A trava cobre a leitura inteira: duas verificações ao mesmo tempo leriam a mesma janela.
    synchronized(RegistroUso.TRAVA) {
      val config = registro.config()
      // A periódica que sobrou depois de desligar não faz nada.
      if (!config.monitorando) return
      // Sem acesso ao uso a janela não anda: quando a pessoa liberar, a leitura continua daqui (até o
      // limite de 24 h). A fila ainda pode ter aberturas de antes.
      if (PermissaoUso.liberada(context)) {
        val desde = DetectorAberturas.inicioDaJanela(config.ultimaVerificacaoMs, agoraMs)
        try {
          val eventos = LeitorEventos.ler(context, desde, agoraMs, config.pacotes)
          val resultado =
            DetectorAberturas.detectar(eventos, config.pacotes, desde, agoraMs, config.ultimoUso)
          registro.trocarFila { FilaEnvio.acrescentar(it, resultado.aberturas, agoraMs) }
          registro.anotar(agoraMs, resultado.ultimoUso)
        } catch (erro: RuntimeException) {
          // A próxima passada tenta a mesma janela de novo.
          Log.w(TAG, "Falha na verificação de uso ($origem)", erro)
        }
      }
    }
    EnvioAberturas(context).enviarFila(agoraMs)
  }

  private companion object {
    const val TAG = "MonyAppUsage"
  }
}
