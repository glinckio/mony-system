package com.monitorizze.appusage

import org.junit.Assert.assertEquals
import org.junit.Test

class HistoricoTest {
  @Test
  fun `detecções vão e voltam do texto`() {
    val lista = listOf(Deteccao("com.shopee.br", 1_000L, 61_000L), Deteccao("com.zzkko", 2_000L, 62_000L))
    assertEquals(lista, Historico.lerDeteccoes(Historico.codificarDeteccoes(lista)))
  }

  @Test
  fun `execuções vão e voltam do texto, com e sem erro`() {
    val lista =
      listOf(
        Execucao(10L, Historico.ORIGEM_PERIODICA, true, 1L, 10L, 312, 1, 45L, null),
        Execucao(20L, Historico.ORIGEM_MANUAL, false, 10L, 20L, 0, 0, 3L, "Falha | com\nquebra"),
      )
    val lidas = Historico.lerExecucoes(Historico.codificarExecucoes(lista))
    assertEquals(lista[0], lidas[0])
    // A mensagem é limpa para não quebrar o formato.
    assertEquals("Falha / com quebra", lidas[1].erro)
  }

  @Test
  fun `último uso vai e volta do texto`() {
    val mapa = mapOf("com.shopee.br" to 5L, "com.zzkko" to 7L)
    assertEquals(mapa, Historico.lerUltimoUso(Historico.codificarUltimoUso(mapa)))
  }

  @Test
  fun `linha estragada ou vazia é descartada`() {
    assertEquals(emptyList<Deteccao>(), Historico.lerDeteccoes(null))
    assertEquals(
      listOf(Deteccao("com.zzkko", 1L, 2L)),
      Historico.lerDeteccoes("lixo\ncom.shopee.br|x|2\n\ncom.zzkko|1|2"),
    )
    assertEquals(emptyList<Execucao>(), Historico.lerExecucoes("1|periodica|talvez|1|2|3|4|5|"))
    assertEquals(mapOf("a.b" to 3L), Historico.lerUltimoUso("a.b|3\nc.d|\nsemvalor"))
  }

  @Test
  fun `guarda só os mais recentes`() {
    assertEquals(listOf(3, 4, 5), Historico.acrescentar(listOf(1, 2, 3), listOf(4, 5), 3))
  }
}
