package com.monitorizze.appusage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** O que o worker precisa para mandar a abertura sem o JS: o token de evento e a URL da API. */
internal data class Credencial(val token: String, val urlApi: String)

/**
 * O token de evento (`mte_…`, T-121a) cifrado com uma chave AES do Android Keystore, que não sai do
 * aparelho. O worker roda sem o JS, então o token não pode ficar no cofre do app (expo-secure-store).
 * Chave perdida (backup restaurado em outro aparelho, por exemplo) → o token é esquecido e a pessoa
 * liga o recurso de novo.
 */
internal class CofreToken(context: Context) {
  private val preferencias = context.getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE)

  fun gravar(credencial: Credencial) =
    synchronized(TRAVA) {
      preferencias
        .edit()
        .putString(TOKEN, cifrar(credencial.token))
        .putString(URL_API, credencial.urlApi)
        .putBoolean(RECUSADO, false)
        .commit()
    }

  fun ler(): Credencial? =
    synchronized(TRAVA) {
      val cifrado = preferencias.getString(TOKEN, null) ?: return null
      val url = preferencias.getString(URL_API, null) ?: return null
      val token =
        try {
          decifrar(cifrado)
        } catch (erro: GeneralSecurityException) {
          Log.w(TAG, "Token de evento ilegível", erro)
          null
        } catch (erro: IllegalArgumentException) {
          Log.w(TAG, "Token de evento ilegível", erro)
          null
        }
      if (token == null) apagar(recusado = false)
      token?.let { Credencial(it, url) }
    }

  /** `recusado`: o servidor recusou o token (401 ou 403); a tela avisa que os alertas pararam. */
  fun apagar(recusado: Boolean) =
    synchronized(TRAVA) {
      preferencias.edit().remove(TOKEN).remove(URL_API).putBoolean(RECUSADO, recusado).commit()
    }

  fun recusado(): Boolean = synchronized(TRAVA) { preferencias.getBoolean(RECUSADO, false) }

  private fun chave(): SecretKey {
    val loja = KeyStore.getInstance(LOJA).apply { load(null) }
    (loja.getKey(APELIDO, null) as? SecretKey)?.let {
      return it
    }
    val gerador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, LOJA)
    gerador.init(
      KeyGenParameterSpec.Builder(
          APELIDO,
          KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return gerador.generateKey()
  }

  /** `iv:cifrado`, os dois em Base64. */
  private fun cifrar(texto: String): String {
    val cifra = Cipher.getInstance(TRANSFORMACAO).apply { init(Cipher.ENCRYPT_MODE, chave()) }
    val cifrado = cifra.doFinal(texto.toByteArray(Charsets.UTF_8))
    return base64(cifra.iv) + ":" + base64(cifrado)
  }

  private fun decifrar(guardado: String): String {
    val partes = guardado.split(':')
    require(partes.size == 2) { "Formato do token guardado" }
    val iv = Base64.decode(partes[0], Base64.NO_WRAP)
    val cifra =
      Cipher.getInstance(TRANSFORMACAO).apply {
        init(Cipher.DECRYPT_MODE, chave(), GCMParameterSpec(128, iv))
      }
    return String(cifra.doFinal(Base64.decode(partes[1], Base64.NO_WRAP)), Charsets.UTF_8)
  }

  private fun base64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)

  private companion object {
    val TRAVA = Any()
    const val TAG = "MonyAppUsage"
    const val ARQUIVO = "mony_app_usage_cofre"
    const val TOKEN = "token"
    const val URL_API = "url_api"
    const val RECUSADO = "recusado"
    const val LOJA = "AndroidKeyStore"
    const val APELIDO = "mony_app_usage_token_evento"
    const val TRANSFORMACAO = "AES/GCM/NoPadding"
  }
}
