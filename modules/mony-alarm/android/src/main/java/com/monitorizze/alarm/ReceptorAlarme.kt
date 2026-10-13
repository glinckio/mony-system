package com.monitorizze.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Disparo do alarme e os botões [Parar] e [Adiar] da notificação. Roda sem o JS. */
class ReceptorAlarme : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val agora = System.currentTimeMillis()
    when (intent.action) {
      AgendadorAlarmes.ACAO_DISPARAR -> {
        val id = intent.data?.lastPathSegment ?: return
        // Fora da agenda: cancelado depois de o sistema já ter separado o disparo.
        val alarme = RegistroAlarmes(context).tirar(id) ?: return
        RegistroAlarmes(context).anotarDisparo(
          Disparo(id, alarme.instanteMs, agora, intent.getBooleanExtra(AgendadorAlarmes.EXTRA_EXATO, false)),
        )
        NotificacaoAlarme.mostrar(context, alarme)
      }
      NotificacaoAlarme.ACAO_PARAR -> {
        val id = intent.getStringExtra(NotificacaoAlarme.EXTRA_ID) ?: return
        NotificacaoAlarme.fechar(context, id)
      }
      NotificacaoAlarme.ACAO_ADIAR -> {
        val id = intent.getStringExtra(NotificacaoAlarme.EXTRA_ID) ?: return
        NotificacaoAlarme.fechar(context, id)
        val tocando =
          Alarme(
            id = id,
            instanteMs = agora,
            titulo = intent.getStringExtra(NotificacaoAlarme.EXTRA_TITULO).orEmpty(),
            corpo = intent.getStringExtra(NotificacaoAlarme.EXTRA_CORPO).orEmpty(),
            adiado = id.endsWith(":adiado"),
          )
        val adiado = PlanoAlarmes.adiar(tocando, agora)
        synchronized(RegistroAlarmes.TRAVA) {
          RegistroAlarmes(context).incluir(adiado)
          AgendadorAlarmes.agendar(context, adiado, AgendadorAlarmes.exatoLiberado(context))
        }
      }
    }
  }
}
