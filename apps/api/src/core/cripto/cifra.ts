import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { Global, Injectable, Logger, Module } from '@nestjs/common';

import { Configuracao } from '../config/configuracao';
import { ErroDominio } from '../erros/erro-dominio';

const ALGORITMO = 'aes-256-gcm';
const BYTES_IV = 12;
const BYTES_TAG = 16;
const VERSAO = 'v1';

/** Só fora de produção, quando não há `CRIPTO_CHAVE_MESTRA`: fixa, para os dados sobreviverem à subida. */
const CHAVE_DESENVOLVIMENTO = createHash('sha256').update('mony-chave-de-desenvolvimento').digest();

function cifrarCom(chave: Buffer, dados: Buffer): Buffer {
  const iv = randomBytes(BYTES_IV);
  const cifra = createCipheriv(ALGORITMO, chave, iv);
  const corpo = Buffer.concat([cifra.update(dados), cifra.final()]);
  return Buffer.concat([iv, cifra.getAuthTag(), corpo]);
}

function decifrarCom(chave: Buffer, pacote: Buffer): Buffer {
  const iv = pacote.subarray(0, BYTES_IV);
  const tag = pacote.subarray(BYTES_IV, BYTES_IV + BYTES_TAG);
  const decifra = createDecipheriv(ALGORITMO, chave, iv);
  decifra.setAuthTag(tag);
  return Buffer.concat([decifra.update(pacote.subarray(BYTES_IV + BYTES_TAG)), decifra.final()]);
}

/** O texto cifrado foi mexido, é de outra chave ou não é desta cifra. */
export class ErroCifra extends Error {
  constructor() {
    super('Texto cifrado inválido.');
    this.name = 'ErroCifra';
  }
}

/**
 * Criptografia de envelope (doc 11, T-085a): cada valor ganha a sua chave de dados, que cifra o
 * valor com AES-256-GCM e sai cifrada pela chave mestra. O resultado é
 * `v1.<chave de dados cifrada>.<valor cifrado>`, em base64url, com o IV e a tag de cada parte.
 * Hoje a chave mestra vem do ambiente (`CRIPTO_CHAVE_MESTRA`); a KMS entra na T-085b, no lugar da
 * chave mestra, sem mudar o formato do valor.
 */
@Injectable()
export class Cifra {
  private readonly chaveMestra: Buffer | null;

  constructor(config: Configuracao) {
    const chave = config.chaveMestraCripto;
    if (chave !== undefined) this.chaveMestra = chave;
    else if (config.ehProducao) this.chaveMestra = null;
    else {
      if (config.ambiente === 'development') {
        new Logger('Cifra').warn('CRIPTO_CHAVE_MESTRA vazia: usando a chave de desenvolvimento.');
      }
      this.chaveMestra = CHAVE_DESENVOLVIMENTO;
    }
  }

  /** Em produção sem chave mestra, nada é cifrado. */
  get disponivel(): boolean {
    return this.chaveMestra !== null;
  }

  cifrar(texto: string): string {
    const mestra = this.exigirChave();
    const chaveDados = randomBytes(32);
    const envelope = cifrarCom(mestra, chaveDados);
    const valor = cifrarCom(chaveDados, Buffer.from(texto, 'utf8'));
    chaveDados.fill(0);
    return [VERSAO, envelope.toString('base64url'), valor.toString('base64url')].join('.');
  }

  /** Lança `ErroCifra` se o texto foi mexido ou é de outra chave. */
  decifrar(cifrado: string): string {
    const mestra = this.exigirChave();
    const [versao, envelope, valor, ...resto] = cifrado.split('.');
    if (versao !== VERSAO || envelope === undefined || valor === undefined || resto.length > 0) {
      throw new ErroCifra();
    }
    try {
      const chaveDados = decifrarCom(mestra, Buffer.from(envelope, 'base64url'));
      const texto = decifrarCom(chaveDados, Buffer.from(valor, 'base64url')).toString('utf8');
      chaveDados.fill(0);
      return texto;
    } catch {
      throw new ErroCifra();
    }
  }

  private exigirChave(): Buffer {
    if (this.chaveMestra === null) {
      throw new ErroDominio('SERVICO_INDISPONIVEL', {
        mensagem: 'A conexão com serviços externos ainda não está disponível.',
      });
    }
    return this.chaveMestra;
  }
}

@Global()
@Module({ providers: [Cifra], exports: [Cifra] })
export class CriptoModule {}
