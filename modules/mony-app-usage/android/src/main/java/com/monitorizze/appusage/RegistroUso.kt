package com.monitorizze.appusage

import android.content.Context

internal data class ConfigUso(
  val monitorando: Boolean,
  val pacotes: Set<String>,
  val ultimaVerificacaoMs: Long?,
  val ultimoUso: Map<String, Long>,
)

/**
 * Estado do módulo nas preferências do app, lido pelo worker (sem o JS rodando) e pela tela de apps
 * de compra. Toda leitura e escrita passa por [TRAVA]: o worker e as funções do módulo rodam em
 * threads diferentes do mesmo processo.
 */
internal class RegistroUso(context: Context) {
  private val preferencias = context.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE)

  fun config(): ConfigUso =
    synchronized(TRAVA) {
      ConfigUso(
        monitorando = preferencias.getBoolean(MONITORANDO, false),
        pacotes = preferencias.getStringSet(PACOTES, emptySet()).orEmpty().toSet(),
        ultimaVerificacaoMs = preferencias.getLong(ULTIMA_VERIFICACAO, 0L).takeIf { it > 0L },
        ultimoUso = Historico.lerUltimoUso(preferencias.getString(ULTIMO_USO, null)),
      )
    }

  /**
   * Liga com a lista de apps, ou troca a lista. A primeira janela começa agora: o que foi aberto
   * antes não conta.
   */
  fun iniciar(pacotes: Set<String>, agoraMs: Long) =
    synchronized(TRAVA) {
      val jaMonitorando = preferencias.getBoolean(MONITORANDO, false)
      preferencias
        .edit()
        .putBoolean(MONITORANDO, true)
        .putStringSet(PACOTES, pacotes)
        .apply { if (!jaMonitorando) putLong(ULTIMA_VERIFICACAO, agoraMs) }
        .commit()
    }

  fun parar() = synchronized(TRAVA) { preferencias.edit().putBoolean(MONITORANDO, false).commit() }

  /** Grava o fim de uma leitura: até onde leu e o último uso de cada app. */
  fun anotar(ateMs: Long, ultimoUso: Map<String, Long>) =
    synchronized(TRAVA) {
      preferencias
        .edit()
        .putLong(ULTIMA_VERIFICACAO, ateMs)
        .putString(ULTIMO_USO, Historico.codificarUltimoUso(ultimoUso))
        .commit()
    }

  fun fila(): List<Abertura> =
    synchronized(TRAVA) { Historico.lerFila(preferencias.getString(FILA, null)) }

  /** Troca a fila de envio pelo resultado de [mudar] e devolve a nova. */
  fun trocarFila(mudar: (List<Abertura>) -> List<Abertura>): List<Abertura> =
    synchronized(TRAVA) {
      val nova = mudar(fila())
      preferencias.edit().putString(FILA, Historico.codificarFila(nova)).commit()
      nova
    }

  companion object {
    /** Uma trava por processo: o worker e o módulo usam instâncias diferentes do registro. */
    val TRAVA = Any()

    private const val ARQUIVO = "mony_app_usage"
    private const val MONITORANDO = "monitorando"
    private const val PACOTES = "pacotes"
    private const val ULTIMA_VERIFICACAO = "ultima_verificacao"
    private const val ULTIMO_USO = "ultimo_uso"
    private const val FILA = "fila_envio"
  }
}
