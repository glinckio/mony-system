package com.monitorizze.appusage

import org.junit.Assert.assertEquals
import org.junit.Test

class HistoricoTest {
  @Test
  fun `último uso vai e volta do texto`() {
    val mapa = mapOf("com.shopee.br" to 5L, "com.zzkko" to 7L)
    assertEquals(mapa, Historico.lerUltimoUso(Historico.codificarUltimoUso(mapa)))
  }

  @Test
  fun `fila de envio vai e volta do texto`() {
    val fila = listOf(Abertura("com.shopee.br", 1_000L), Abertura("com.zzkko", 2_000L))
    assertEquals(fila, Historico.lerFila(Historico.codificarFila(fila)))
  }

  @Test
  fun `linha estragada ou vazia é descartada`() {
    assertEquals(emptyList<Abertura>(), Historico.lerFila(null))
    assertEquals(
      listOf(Abertura("com.zzkko", 1L)),
      Historico.lerFila("lixo\ncom.shopee.br|x\n\n|3\ncom.zzkko|1"),
    )
    assertEquals(mapOf("a.b" to 3L), Historico.lerUltimoUso("a.b|3\nc.d|\nsemvalor"))
  }
}
