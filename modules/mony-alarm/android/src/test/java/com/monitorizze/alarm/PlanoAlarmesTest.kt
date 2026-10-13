package com.monitorizze.alarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PlanoAlarmesTest {
  private val minuto = 60_000L
  private val agora = 1_000 * minuto

  private fun alarme(id: String, emMinutos: Long, adiado: Boolean = false) =
    Alarme(id, agora + emMinutos * minuto, "Pagar a fatura", "Vence hoje", adiado)

  @Test
  fun `a lista do servidor troca a agenda inteira`() {
    val plano =
      PlanoAlarmes.planejar(
        desejados = listOf(alarme("b", 30), alarme("a", 10)),
        atuais = listOf(alarme("a", 5), alarme("velho", 20)),
        agoraMs = agora,
      )
    assertEquals(listOf("a", "b"), plano.agendar.map { it.id })
    // O "a" fica (e é reagendado no novo horário); o "velho" sai.
    assertEquals(agora + 10 * minuto, plano.agendar.first().instanteMs)
    assertEquals(setOf("velho"), plano.cancelar)
    assertEquals(0, plano.descartados)
  }

  @Test
  fun `alarme no passado, no instante de agora ou repetido não é agendado`() {
    val plano =
      PlanoAlarmes.planejar(
        desejados = listOf(alarme("passado", -1), alarme("agora", 0), alarme("x", 5), alarme("x", 9)),
        atuais = emptyList(),
        agoraMs = agora,
      )
    assertEquals(listOf(alarme("x", 5)), plano.agendar)
    assertEquals(3, plano.descartados)
  }

  @Test
  fun `o adiado continua mesmo fora da lista do servidor, até tocar`() {
    val adiado = alarme("a:adiado", 4, adiado = true)
    val vencido = alarme("b:adiado", -1, adiado = true)
    val plano = PlanoAlarmes.planejar(listOf(alarme("c", 60)), listOf(adiado, vencido), agora)
    assertEquals(listOf("a:adiado", "c"), plano.agendar.map { it.id })
    assertEquals(setOf("b:adiado"), plano.cancelar)
  }

  @Test
  fun `servidor não marca alarme como adiado`() {
    val plano = PlanoAlarmes.planejar(listOf(alarme("a", 5, adiado = true)), emptyList(), agora)
    assertEquals(false, plano.agendar.single().adiado)
  }

  @Test
  fun `no máximo 50 alarmes, os mais próximos, contando os adiados`() {
    val desejados = (1..60).map { alarme("a$it", it.toLong()) }.shuffled()
    val adiados = listOf(alarme("z:adiado", 3, adiado = true), alarme("y:adiado", 100, adiado = true))
    val plano = PlanoAlarmes.planejar(desejados, adiados, agora)
    assertEquals(PlanoAlarmes.MAXIMO, plano.agendar.size)
    assertTrue(plano.agendar.containsAll(adiados))
    // Cabem 48 do servidor: do 1º ao 48º minuto.
    assertEquals((1..48).map { "a$it" }.toSet(), plano.agendar.filter { !it.adiado }.map { it.id }.toSet())
    assertEquals(12, plano.descartados)
    assertEquals(plano.agendar.sortedBy { it.instanteMs }, plano.agendar)
  }

  @Test
  fun `adiar empurra 10 min a partir de agora e mantém um id só`() {
    val primeiro = PlanoAlarmes.adiar(alarme("a", -2), agora)
    assertEquals(Alarme("a:adiado", agora + 10 * minuto, "Pagar a fatura", "Vence hoje", true), primeiro)
    val segundo = PlanoAlarmes.adiar(primeiro, agora + 10 * minuto)
    assertEquals("a:adiado", segundo.id)
    assertEquals(agora + 20 * minuto, segundo.instanteMs)
  }
}
