package com.monitorizze.appusage

/** Uma abertura detectada, com o instante da verificação que a encontrou (mede o atraso). */
data class Deteccao(val pacote: String, val abertoEmMs: Long, val detectadoEmMs: Long)

/** Uma passada da verificação, para a PoC medir se o WorkManager roda e de quanto em quanto tempo. */
data class Execucao(
  val inicioMs: Long,
  /** [Historico.ORIGEM_PERIODICA] ou [Historico.ORIGEM_MANUAL]. */
  val origem: String,
  val permissao: Boolean,
  val desdeMs: Long,
  val ateMs: Long,
  val eventos: Int,
  val aberturas: Int,
  val duracaoMs: Long,
  val erro: String?,
)

/**
 * Histórico guardado nas preferências do app, em texto de uma linha por item e campos separados por
 * `|`. Nome de pacote só tem letras, números, `_` e `.`; a mensagem de erro é limpa antes de gravar.
 * Linha que não se lê é descartada, para um formato antigo nunca derrubar a verificação.
 */
object Historico {
  const val ORIGEM_PERIODICA = "periodica"
  const val ORIGEM_MANUAL = "manual"
  const val MAX_EXECUCOES = 50
  const val MAX_DETECCOES = 100

  /** Junta os novos no fim e guarda só os [maximo] mais recentes. */
  fun <T> acrescentar(lista: List<T>, novos: List<T>, maximo: Int): List<T> = (lista + novos).takeLast(maximo)

  fun codificarDeteccoes(lista: List<Deteccao>): String =
    lista.joinToString("\n") { "${it.pacote}|${it.abertoEmMs}|${it.detectadoEmMs}" }

  fun lerDeteccoes(texto: String?): List<Deteccao> =
    linhas(texto).mapNotNull { linha ->
      val partes = linha.split('|')
      if (partes.size != 3) return@mapNotNull null
      val aberto = partes[1].toLongOrNull() ?: return@mapNotNull null
      val detectado = partes[2].toLongOrNull() ?: return@mapNotNull null
      Deteccao(partes[0], aberto, detectado)
    }

  fun codificarExecucoes(lista: List<Execucao>): String =
    lista.joinToString("\n") {
      listOf(
        it.inicioMs, it.origem, it.permissao, it.desdeMs, it.ateMs, it.eventos, it.aberturas,
        it.duracaoMs, it.erro?.let(::limpar) ?: "",
      ).joinToString("|")
    }

  fun lerExecucoes(texto: String?): List<Execucao> =
    linhas(texto).mapNotNull { linha ->
      val partes = linha.split('|')
      if (partes.size != 9) return@mapNotNull null
      Execucao(
        inicioMs = partes[0].toLongOrNull() ?: return@mapNotNull null,
        origem = partes[1],
        permissao = partes[2].toBooleanStrictOrNull() ?: return@mapNotNull null,
        desdeMs = partes[3].toLongOrNull() ?: return@mapNotNull null,
        ateMs = partes[4].toLongOrNull() ?: return@mapNotNull null,
        eventos = partes[5].toIntOrNull() ?: return@mapNotNull null,
        aberturas = partes[6].toIntOrNull() ?: return@mapNotNull null,
        duracaoMs = partes[7].toLongOrNull() ?: return@mapNotNull null,
        erro = partes[8].ifEmpty { null },
      )
    }

  fun codificarUltimoUso(mapa: Map<String, Long>): String =
    mapa.entries.sortedBy { it.key }.joinToString("\n") { "${it.key}|${it.value}" }

  fun lerUltimoUso(texto: String?): Map<String, Long> =
    linhas(texto)
      .mapNotNull { linha ->
        val partes = linha.split('|')
        val instante = partes.getOrNull(1)?.toLongOrNull()
        if (partes.size != 2 || instante == null) null else partes[0] to instante
      }
      .toMap()

  private fun linhas(texto: String?): List<String> =
    texto.orEmpty().split('\n').filter { it.isNotBlank() }

  private fun limpar(erro: String): String =
    erro.replace('|', '/').replace('\n', ' ').replace('\r', ' ').take(200)
}
