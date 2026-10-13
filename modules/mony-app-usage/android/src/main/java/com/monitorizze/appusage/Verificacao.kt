package com.monitorizze.appusage

import android.content.Context
import android.os.SystemClock
import android.util.Log

/**
 * Uma passada da verificação: lê os eventos desde a anterior, acha as aberturas, grava e avisa.
 * Roda no worker (periódica ou "verificar agora"), sem o JS.
 */
internal class Verificacao(private val context: Context) {
  private val registro = RegistroUso(context)

  fun executar(origem: String, agoraMs: Long = System.currentTimeMillis()) {
    // A trava cobre a passada inteira: duas verificações ao mesmo tempo leriam a mesma janela.
    synchronized(RegistroUso.TRAVA) {
      val config = registro.config()
      // A periódica que sobrou depois de "parar" não faz nada; a manual roda sempre.
      if (origem == Historico.ORIGEM_PERIODICA && !config.monitorando) return
      val inicio = SystemClock.elapsedRealtime()
      val desde = DetectorAberturas.inicioDaJanela(config.ultimaVerificacaoMs, agoraMs)

      if (!PermissaoUso.liberada(context)) {
        // Sem acesso ao uso a janela não anda: quando a pessoa liberar, a leitura continua daqui
        // (até o limite de 24 h).
        registro.anotar(execucao(origem, agoraMs, false, desde, 0, 0, inicio, null), emptyList(), null)
        return
      }

      try {
        val eventos = LeitorEventos.ler(context, desde, agoraMs, config.pacotes)
        val resultado =
          DetectorAberturas.detectar(eventos, config.pacotes, desde, agoraMs, config.ultimoUso)
        val deteccoes = resultado.aberturas.map { Deteccao(it.pacote, it.abertoEmMs, agoraMs) }
        registro.anotar(
          execucao(origem, agoraMs, true, desde, eventos.size, deteccoes.size, inicio, null),
          deteccoes,
          resultado.ultimoUso,
        )
        if (deteccoes.isNotEmpty()) AvisoTeste.mostrar(context, deteccoes)
      } catch (erro: RuntimeException) {
        // Fica no histórico para a PoC ver; a próxima passada tenta a mesma janela de novo.
        Log.w(TAG, "Falha na verificação de uso", erro)
        val mensagem = erro.javaClass.simpleName + (erro.message?.let { ": $it" } ?: "")
        registro.anotar(execucao(origem, agoraMs, true, desde, 0, 0, inicio, mensagem), emptyList(), null)
      }
    }
  }

  private fun execucao(
    origem: String,
    agoraMs: Long,
    permissao: Boolean,
    desde: Long,
    eventos: Int,
    aberturas: Int,
    inicio: Long,
    erro: String?,
  ) =
    Execucao(
      inicioMs = agoraMs,
      origem = origem,
      permissao = permissao,
      desdeMs = desde,
      ateMs = agoraMs,
      eventos = eventos,
      aberturas = aberturas,
      duracaoMs = SystemClock.elapsedRealtime() - inicio,
      erro = erro,
    )

  private companion object {
    const val TAG = "MonyAppUsage"
  }
}
