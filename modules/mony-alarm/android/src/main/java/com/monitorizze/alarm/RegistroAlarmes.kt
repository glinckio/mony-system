package com.monitorizze.alarm

import android.content.Context

/** Textos que aparecem no alarme, mandados pelo app (i18n) na sincronização. */
internal data class TextosAlarme(val canal: String, val parar: String, val adiar: String)

/**
 * Agenda e histórico nas preferências do app: o disparo, o adiar e o reagendar depois de ligar o
 * aparelho rodam sem o JS. Toda leitura e escrita passa por [TRAVA] (receptores e módulo rodam em
 * threads diferentes do mesmo processo).
 */
internal class RegistroAlarmes(context: Context) {
  private val preferencias = context.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE)

  fun alarmes(): List<Alarme> = synchronized(TRAVA) { Codificacao.lerAlarmes(preferencias.getString(ALARMES, null)) }

  fun salvarAlarmes(lista: List<Alarme>) =
    synchronized(TRAVA) { preferencias.edit().putString(ALARMES, Codificacao.codificarAlarmes(lista)).commit() }

  /** Tira o alarme da agenda e devolve como estava (null se já não estava). */
  fun tirar(id: String): Alarme? =
    synchronized(TRAVA) {
      val lista = alarmes()
      val alarme = lista.firstOrNull { it.id == id } ?: return@synchronized null
      salvarAlarmes(lista.filter { it.id != id })
      alarme
    }

  fun incluir(alarme: Alarme) =
    synchronized(TRAVA) { salvarAlarmes(alarmes().filter { it.id != alarme.id } + alarme) }

  fun disparos(): List<Disparo> =
    synchronized(TRAVA) { Codificacao.lerDisparos(preferencias.getString(DISPAROS, null)) }

  fun anotarDisparo(disparo: Disparo) =
    synchronized(TRAVA) {
      val lista = Codificacao.acrescentar(disparos(), listOf(disparo), Codificacao.MAX_DISPAROS)
      preferencias.edit().putString(DISPAROS, Codificacao.codificarDisparos(lista)).commit()
    }

  fun limparDisparos() = synchronized(TRAVA) { preferencias.edit().remove(DISPAROS).commit() }

  fun textos(): TextosAlarme =
    synchronized(TRAVA) {
      TextosAlarme(
        canal = preferencias.getString(TEXTO_CANAL, null) ?: "Alarmes",
        parar = preferencias.getString(TEXTO_PARAR, null) ?: "Parar",
        adiar = preferencias.getString(TEXTO_ADIAR, null) ?: "Adiar 10 min",
      )
    }

  fun salvarTextos(textos: TextosAlarme) =
    synchronized(TRAVA) {
      preferencias
        .edit()
        .putString(TEXTO_CANAL, textos.canal)
        .putString(TEXTO_PARAR, textos.parar)
        .putString(TEXTO_ADIAR, textos.adiar)
        .commit()
    }

  companion object {
    val TRAVA = Any()

    private const val ARQUIVO = "mony_alarm"
    private const val ALARMES = "alarmes"
    private const val DISPAROS = "disparos"
    private const val TEXTO_CANAL = "texto_canal"
    private const val TEXTO_PARAR = "texto_parar"
    private const val TEXTO_ADIAR = "texto_adiar"
  }
}
