package com.monitorizze.appusage

import org.junit.Assert.assertEquals
import org.junit.Test

class FilaEnvioTest {
  private val minuto = 60_000L
  private val agora = 1_000L * minuto

  @Test
  fun `junta as novas sem repetir, da mais antiga para a mais nova`() {
    val fila = listOf(Abertura("com.zzkko", agora - 5 * minuto))
    val novas = listOf(Abertura("com.shopee.br", agora - 10 * minuto), Abertura("com.zzkko", agora - 5 * minuto))
    assertEquals(
      listOf(Abertura("com.shopee.br", agora - 10 * minuto), Abertura("com.zzkko", agora - 5 * minuto)),
      FilaEnvio.acrescentar(fila, novas, agora),
    )
  }

  @Test
  fun `abertura com mais de uma hora sai da fila`() {
    val fila = listOf(Abertura("com.zzkko", agora - 61 * minuto), Abertura("com.zzkko", agora - 60 * minuto))
    assertEquals(listOf(Abertura("com.zzkko", agora - 60 * minuto)), FilaEnvio.acrescentar(fila, emptyList(), agora))
  }

  @Test
  fun `guarda só as mais recentes`() {
    val novas = (1..(FilaEnvio.MAXIMO + 5)).map { Abertura("app.$it", agora - (60 - it % 60) * minuto + it) }
    val fila = FilaEnvio.acrescentar(emptyList(), novas, agora)
    assertEquals(FilaEnvio.MAXIMO, fila.size)
    assertEquals(novas.sortedBy { it.abertoEmMs }.takeLast(FilaEnvio.MAXIMO), fila)
  }

  @Test
  fun `classifica a resposta do servidor`() {
    assertEquals(ResultadoEnvio.ENVIADA, FilaEnvio.classificar(200))
    assertEquals(ResultadoEnvio.TOKEN_RECUSADO, FilaEnvio.classificar(401))
    assertEquals(ResultadoEnvio.TOKEN_RECUSADO, FilaEnvio.classificar(403))
    assertEquals(ResultadoEnvio.TENTAR_DE_NOVO, FilaEnvio.classificar(null))
    assertEquals(ResultadoEnvio.TENTAR_DE_NOVO, FilaEnvio.classificar(429))
    assertEquals(ResultadoEnvio.TENTAR_DE_NOVO, FilaEnvio.classificar(503))
    assertEquals(ResultadoEnvio.TENTAR_DE_NOVO, FilaEnvio.classificar(408))
    assertEquals(ResultadoEnvio.DESCARTADA, FilaEnvio.classificar(400))
    assertEquals(ResultadoEnvio.DESCARTADA, FilaEnvio.classificar(404))
  }

  @Test
  fun `instante em ISO 8601 UTC`() {
    assertEquals("2026-11-04T15:30:00.123Z", FilaEnvio.isoUtc(1_793_806_200_123L))
  }
}
