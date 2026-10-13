package com.monitorizze.alarm

import org.junit.Assert.assertEquals
import org.junit.Test

class CodificacaoTest {
  @Test
  fun `texto com barra, separador e quebra de linha volta igual`() {
    val texto = "Pagar | fatura\\cartão\nlinha 2\r\\p fim\\"
    assertEquals(texto, Codificacao.desescapar(Codificacao.escapar(texto)))
    assertEquals(false, Codificacao.escapar(texto).contains('|'))
    assertEquals(false, Codificacao.escapar(texto).contains('\n'))
  }

  @Test
  fun `alarmes vão e voltam do texto`() {
    val lista =
      listOf(
        Alarme("lembrete-1:2026-10-13", 1_000L, "Conta de luz | casa", "Vence hoje\nR$ 120,00"),
        Alarme("lembrete-1:2026-10-13:adiado", 2_000L, "", "", adiado = true),
      )
    assertEquals(lista, Codificacao.lerAlarmes(Codificacao.codificarAlarmes(lista)))
  }

  @Test
  fun `disparos vão e voltam do texto`() {
    val lista = listOf(Disparo("a", 1_000L, 1_200L, true), Disparo("b|c", 5_000L, 65_000L, false))
    assertEquals(lista, Codificacao.lerDisparos(Codificacao.codificarDisparos(lista)))
  }

  @Test
  fun `linha estragada é descartada`() {
    assertEquals(emptyList<Alarme>(), Codificacao.lerAlarmes(null))
    assertEquals(1, Codificacao.lerAlarmes("a|x|t|c|false\nb|1|t|c|false\nc|2|t|c").size)
    assertEquals(emptyList<Disparo>(), Codificacao.lerDisparos("a|1|2|talvez"))
  }

  @Test
  fun `guarda só os mais recentes`() {
    assertEquals(listOf(3, 4, 5), Codificacao.acrescentar(listOf(1, 2, 3), listOf(4, 5), 3))
  }
}
