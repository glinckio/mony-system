package com.monitorizze.alarm

/**
 * Alarmes e disparos guardados nas preferências do app, uma linha por item e campos separados por
 * `|`. Título e corpo vêm do servidor e podem ter qualquer caractere, então `\`, `|` e quebras de
 * linha são escapados. Linha que não se lê é descartada.
 */
object Codificacao {
  const val MAX_DISPAROS = 100

  fun escapar(texto: String): String =
    buildString {
      for (caractere in texto) {
        when (caractere) {
          '\\' -> append("\\\\")
          '|' -> append("\\p")
          '\n' -> append("\\n")
          '\r' -> append("\\r")
          else -> append(caractere)
        }
      }
    }

  fun desescapar(texto: String): String =
    buildString {
      var indice = 0
      while (indice < texto.length) {
        val caractere = texto[indice]
        if (caractere == '\\' && indice + 1 < texto.length) {
          when (texto[indice + 1]) {
            'p' -> append('|')
            'n' -> append('\n')
            'r' -> append('\r')
            else -> append(texto[indice + 1])
          }
          indice += 2
        } else {
          append(caractere)
          indice++
        }
      }
    }

  fun codificarAlarmes(lista: List<Alarme>): String =
    lista.joinToString("\n") {
      listOf(escapar(it.id), it.instanteMs, escapar(it.titulo), escapar(it.corpo), it.adiado).joinToString("|")
    }

  fun lerAlarmes(texto: String?): List<Alarme> =
    linhas(texto).mapNotNull { linha ->
      val partes = linha.split('|')
      if (partes.size != 5) return@mapNotNull null
      Alarme(
        id = desescapar(partes[0]),
        instanteMs = partes[1].toLongOrNull() ?: return@mapNotNull null,
        titulo = desescapar(partes[2]),
        corpo = desescapar(partes[3]),
        adiado = partes[4].toBooleanStrictOrNull() ?: return@mapNotNull null,
      )
    }

  fun codificarDisparos(lista: List<Disparo>): String =
    lista.joinToString("\n") { "${escapar(it.id)}|${it.previstoMs}|${it.disparadoMs}|${it.exato}" }

  fun lerDisparos(texto: String?): List<Disparo> =
    linhas(texto).mapNotNull { linha ->
      val partes = linha.split('|')
      if (partes.size != 4) return@mapNotNull null
      Disparo(
        id = desescapar(partes[0]),
        previstoMs = partes[1].toLongOrNull() ?: return@mapNotNull null,
        disparadoMs = partes[2].toLongOrNull() ?: return@mapNotNull null,
        exato = partes[3].toBooleanStrictOrNull() ?: return@mapNotNull null,
      )
    }

  /** Junta os novos no fim e guarda só os [maximo] mais recentes. */
  fun <T> acrescentar(lista: List<T>, novos: List<T>, maximo: Int): List<T> = (lista + novos).takeLast(maximo)

  private fun linhas(texto: String?): List<String> = texto.orEmpty().split('\n').filter { it.isNotBlank() }
}
