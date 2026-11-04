package com.monitorizze.appusage

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** O que fazer com uma abertura depois de tentar mandar ao servidor. */
enum class ResultadoEnvio {
  /** O servidor recebeu (com ou sem alerta): sai da fila. */
  ENVIADA,

  /** O servidor recusou o corpo: mandar de novo não adianta. Sai da fila. */
  DESCARTADA,

  /** Sem rede, tempo esgotado, 429 ou 5xx: fica na fila para a próxima verificação. */
  TENTAR_DE_NOVO,

  /** 401 ou 403: o token de evento não vale mais (saiu, revogou ou perdeu o plano). Para tudo. */
  TOKEN_RECUSADO,
}

/**
 * A fila das aberturas que ainda não chegaram ao servidor (T-121b, doc 10). Sem rede, a abertura
 * espera a próxima verificação; mas o aviso só faz sentido na hora da compra, então a fila guarda só
 * a última hora (o servidor também ignora as mais antigas, `IDADE_MAXIMA_ABERTURA_MINUTOS`).
 */
object FilaEnvio {
  const val MAXIMO = 50

  /** Igual a `IDADE_MAXIMA_ABERTURA_MINUTOS` de `@mony/shared/apps-compra`. */
  const val IDADE_MAXIMA_MS: Long = 60L * 60 * 1000

  /** Junta as novas, sem repetir, tira as velhas demais e guarda as [MAXIMO] mais recentes. */
  fun acrescentar(fila: List<Abertura>, novas: List<Abertura>, agoraMs: Long): List<Abertura> =
    (fila + novas)
      .distinct()
      .filter { agoraMs - it.abertoEmMs <= IDADE_MAXIMA_MS }
      .sortedBy { it.abertoEmMs }
      .takeLast(MAXIMO)

  /** `status` nulo: não houve resposta (sem rede, DNS, tempo esgotado). */
  fun classificar(status: Int?): ResultadoEnvio =
    when {
      status == null -> ResultadoEnvio.TENTAR_DE_NOVO
      status in 200..299 -> ResultadoEnvio.ENVIADA
      status == 401 || status == 403 -> ResultadoEnvio.TOKEN_RECUSADO
      status == 408 || status == 429 || status >= 500 -> ResultadoEnvio.TENTAR_DE_NOVO
      else -> ResultadoEnvio.DESCARTADA
    }

  /** O instante no formato ISO 8601 em UTC que a API espera (`abertoEm`). */
  fun isoUtc(instanteMs: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT)
      .apply { timeZone = TimeZone.getTimeZone("UTC") }
      .format(Date(instanteMs))
}
