package com.monitorizze.appusage

/**
 * Texto guardado nas preferências do app: uma linha por item, campos separados por `|`. Nome de
 * pacote só tem letras, números, `_` e `.`. Linha que não se lê é descartada, para um formato antigo
 * nunca derrubar a verificação.
 */
object Historico {
  const val ORIGEM_PERIODICA = "periodica"

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

  fun codificarFila(fila: List<Abertura>): String =
    fila.joinToString("\n") { "${it.pacote}|${it.abertoEmMs}" }

  fun lerFila(texto: String?): List<Abertura> =
    linhas(texto).mapNotNull { linha ->
      val partes = linha.split('|')
      val instante = partes.getOrNull(1)?.toLongOrNull()
      if (partes.size != 2 || partes[0].isEmpty() || instante == null) null else Abertura(partes[0], instante)
    }

  private fun linhas(texto: String?): List<String> =
    texto.orEmpty().split('\n').filter { it.isNotBlank() }
}
