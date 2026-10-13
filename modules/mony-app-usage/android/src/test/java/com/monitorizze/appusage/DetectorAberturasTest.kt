package com.monitorizze.appusage

import com.monitorizze.appusage.TipoEvento.FRENTE
import com.monitorizze.appusage.TipoEvento.FUNDO
import org.junit.Assert.assertEquals
import org.junit.Test

class DetectorAberturasTest {
  private val minuto = 60_000L
  private val shopee = "com.shopee.br"
  private val ifood = "br.com.brainweb.ifood"
  private val chrome = "com.android.chrome"
  private val monitorados = setOf(shopee, ifood)

  private fun frente(pacote: String, minutos: Long) = EventoUso(pacote, minutos * minuto, FRENTE)

  private fun fundo(pacote: String, minutos: Long) = EventoUso(pacote, minutos * minuto, FUNDO)

  private fun detectar(
    eventos: List<EventoUso>,
    desde: Long = 0,
    ate: Long = 24 * 60,
    ultimoUso: Map<String, Long> = emptyMap(),
  ) = DetectorAberturas.detectar(eventos, monitorados, desde * minuto, ate * minuto, ultimoUso)

  @Test
  fun `app monitorado que vem para a frente vira abertura`() {
    val resultado = detectar(listOf(frente(shopee, 10)))
    assertEquals(listOf(Abertura(shopee, 10 * minuto)), resultado.aberturas)
  }

  @Test
  fun `app fora da lista não conta e não fica guardado`() {
    val resultado = detectar(listOf(frente(chrome, 10), fundo(chrome, 12)))
    assertEquals(emptyList<Abertura>(), resultado.aberturas)
    assertEquals(emptyMap<String, Long>(), resultado.ultimoUso)
  }

  @Test
  fun `trocar de tela dentro do app não conta duas vezes`() {
    val eventos = listOf(frente(shopee, 10), fundo(shopee, 50), frente(shopee, 50), fundo(shopee, 55))
    val resultado = detectar(eventos)
    assertEquals(listOf(Abertura(shopee, 10 * minuto)), resultado.aberturas)
    assertEquals(mapOf(shopee to 55 * minuto), resultado.ultimoUso)
  }

  @Test
  fun `voltar depois de 30 min fora conta de novo, antes disso não`() {
    val eventos =
      listOf(
        frente(shopee, 0), fundo(shopee, 5),
        frente(shopee, 34), fundo(shopee, 40), // 29 min fora: a mesma visita
        frente(shopee, 70), // 30 min fora: abertura nova
      )
    val resultado = detectar(eventos)
    assertEquals(listOf(Abertura(shopee, 0), Abertura(shopee, 70 * minuto)), resultado.aberturas)
  }

  @Test
  fun `uso longo numa tela só termina na saída, e a volta logo depois é a mesma visita`() {
    // Duas horas na mesma tela não geram evento; a saída é o último contato.
    val resultado = detectar(listOf(frente(shopee, 0), fundo(shopee, 120), frente(shopee, 125)))
    assertEquals(listOf(Abertura(shopee, 0)), resultado.aberturas)
  }

  @Test
  fun `a visita que atravessa duas verificações conta uma vez`() {
    val primeira = detectar(listOf(frente(shopee, 10)), desde = 0, ate = 15)
    val segunda =
      detectar(
        listOf(fundo(shopee, 16), frente(shopee, 20)),
        desde = 15,
        ate = 30,
        ultimoUso = primeira.ultimoUso,
      )
    assertEquals(listOf(Abertura(shopee, 10 * minuto)), primeira.aberturas)
    assertEquals(emptyList<Abertura>(), segunda.aberturas)
    assertEquals(mapOf(shopee to 20 * minuto), segunda.ultimoUso)
  }

  @Test
  fun `janela inclui o começo e exclui o fim`() {
    val resultado = detectar(listOf(frente(shopee, 15), frente(ifood, 30)), desde = 15, ate = 30)
    assertEquals(listOf(Abertura(shopee, 15 * minuto)), resultado.aberturas)
  }

  @Test
  fun `dois apps na mesma janela saem em ordem cronológica, mesmo com eventos fora de ordem`() {
    val resultado = detectar(listOf(frente(ifood, 12), frente(shopee, 3)))
    assertEquals(listOf(Abertura(shopee, 3 * minuto), Abertura(ifood, 12 * minuto)), resultado.aberturas)
  }

  @Test
  fun `no mesmo milissegundo a saída vem antes da entrada`() {
    // Visto pela última vez há 40 min (entrada sem saída na janela anterior) e troca de tela agora.
    val resultado =
      detectar(
        listOf(frente(shopee, 40), fundo(shopee, 40)),
        desde = 30,
        ultimoUso = mapOf(shopee to 0L),
      )
    assertEquals(emptyList<Abertura>(), resultado.aberturas)
  }

  @Test
  fun `app que saiu da lista sai do último uso`() {
    val resultado = detectar(emptyList(), ultimoUso = mapOf(chrome to 5L, shopee to 7L))
    assertEquals(mapOf(shopee to 7L), resultado.ultimoUso)
  }

  @Test
  fun `começo da janela`() {
    val agora = 100 * 24 * 60 * minuto
    val dia = DetectorAberturas.JANELA_MAXIMA_MS
    assertEquals(agora - dia, DetectorAberturas.inicioDaJanela(null, agora))
    assertEquals(agora - 15 * minuto, DetectorAberturas.inicioDaJanela(agora - 15 * minuto, agora))
    // Verificação parada há dois dias: lê só as últimas 24 h.
    assertEquals(agora - dia, DetectorAberturas.inicioDaJanela(agora - 2 * dia, agora))
    // Relógio do aparelho voltou no tempo: janela vazia.
    assertEquals(agora, DetectorAberturas.inicioDaJanela(agora + 5 * minuto, agora))
  }
}
