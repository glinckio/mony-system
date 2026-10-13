package com.monitorizze.appusage

import android.content.Context

internal data class ConfigUso(
  val monitorando: Boolean,
  val pacotes: Set<String>,
  val ultimaVerificacaoMs: Long?,
  val ultimoUso: Map<String, Long>,
)

/**
 * Estado do módulo nas preferências do app, lido pelo worker (sem o JS rodando) e pela tela de
 * teste. Toda leitura e escrita passa por [TRAVA]: o worker e as funções do módulo rodam em threads
 * diferentes do mesmo processo.
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

  fun execucoes(): List<Execucao> =
    synchronized(TRAVA) { Historico.lerExecucoes(preferencias.getString(EXECUCOES, null)) }

  fun deteccoes(): List<Deteccao> =
    synchronized(TRAVA) { Historico.lerDeteccoes(preferencias.getString(DETECCOES, null)) }

  /** Liga com a lista de apps. A primeira janela começa agora: o que foi aberto antes não conta. */
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

  fun limparHistorico() =
    synchronized(TRAVA) { preferencias.edit().remove(EXECUCOES).remove(DETECCOES).commit() }

  /** Grava o resultado de uma verificação. */
  fun anotar(execucao: Execucao, deteccoes: List<Deteccao>, ultimoUso: Map<String, Long>?) =
    synchronized(TRAVA) {
      val editor =
        preferencias
          .edit()
          .putString(
            EXECUCOES,
            Historico.codificarExecucoes(
              Historico.acrescentar(execucoes(), listOf(execucao), Historico.MAX_EXECUCOES),
            ),
          )
      if (deteccoes.isNotEmpty()) {
        editor.putString(
          DETECCOES,
          Historico.codificarDeteccoes(
            Historico.acrescentar(deteccoes(), deteccoes, Historico.MAX_DETECCOES),
          ),
        )
      }
      if (ultimoUso != null) {
        editor.putLong(ULTIMA_VERIFICACAO, execucao.ateMs)
        editor.putString(ULTIMO_USO, Historico.codificarUltimoUso(ultimoUso))
      }
      editor.commit()
    }

  companion object {
    /** Uma trava por processo: o worker e o módulo usam instâncias diferentes do registro. */
    val TRAVA = Any()

    private const val ARQUIVO = "mony_app_usage"
    private const val MONITORANDO = "monitorando"
    private const val PACOTES = "pacotes"
    private const val ULTIMA_VERIFICACAO = "ultima_verificacao"
    private const val ULTIMO_USO = "ultimo_uso"
    private const val EXECUCOES = "execucoes"
    private const val DETECCOES = "deteccoes"
  }
}
