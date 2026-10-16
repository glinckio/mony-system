import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Global, Module } from '@nestjs/common';

import { Configuracao } from '../config/configuracao';
import { ErroDominio } from '../erros/erro-dominio';

/** O que existe no armazenamento para uma chave. */
export interface ObjetoArquivo {
  tamanho: number;
  tipoConteudo: string | undefined;
}

/**
 * Arquivos no S3 privado (doc 11): o app envia e lê direto do S3 por URL assinada de curta
 * validade; a API só assina, confere e apaga. A chave começa por `usuarios/<usuarioId>/`; o que o
 * worker gera para baixar (exportações, T-125) fica em `exportacoes/`, que o bucket apaga sozinho.
 */
export abstract class ArmazenamentoArquivos {
  /** URL de `PUT` que só aceita o tipo de conteúdo informado. */
  abstract urlDeEnvio(chave: string, tipoConteudo: string, segundos: number): Promise<string>;
  /** Com `nomeArquivo`, quem abre a URL baixa o arquivo com esse nome. */
  abstract urlDeLeitura(chave: string, segundos: number, nomeArquivo?: string): Promise<string>;
  /** `null` quando o arquivo ainda não foi enviado. */
  abstract consultar(chave: string): Promise<ObjetoArquivo | null>;
  /** Os primeiros `bytes` do arquivo, para conferir o tipo real (T-144b). */
  abstract lerInicio(chave: string, bytes: number): Promise<Uint8Array>;
  abstract apagar(chave: string): Promise<void>;
  /** Grava um arquivo gerado no servidor (o worker, nas exportações). */
  abstract gravar(chave: string, corpo: Uint8Array, tipoConteudo: string): Promise<void>;
}

/** S3 da AWS, ou compatível (SeaweedFS) quando há `S3_ENDPOINT`. */
export class ArmazenamentoS3 extends ArmazenamentoArquivos {
  constructor(
    private readonly cliente: S3Client,
    private readonly bucket: string,
  ) {
    super();
  }

  urlDeEnvio(chave: string, tipoConteudo: string, segundos: number): Promise<string> {
    return getSignedUrl(
      this.cliente,
      new PutObjectCommand({ Bucket: this.bucket, Key: chave, ContentType: tipoConteudo }),
      // Assina o `content-type`: o S3 recusa o envio com outro tipo de arquivo.
      { expiresIn: segundos, signableHeaders: new Set(['content-type']) },
    );
  }

  urlDeLeitura(chave: string, segundos: number, nomeArquivo?: string): Promise<string> {
    return getSignedUrl(
      this.cliente,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        ...(nomeArquivo === undefined
          ? {}
          : { ResponseContentDisposition: `attachment; filename="${nomeArquivo}"` }),
      }),
      { expiresIn: segundos },
    );
  }

  async consultar(chave: string): Promise<ObjetoArquivo | null> {
    try {
      const resposta = await this.cliente.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: chave }),
      );
      return { tamanho: resposta.ContentLength ?? 0, tipoConteudo: resposta.ContentType };
    } catch (erro) {
      if (erro instanceof NotFound) return null;
      if (erro instanceof S3ServiceException && erro.$metadata.httpStatusCode === 404) return null;
      throw erro;
    }
  }

  async lerInicio(chave: string, bytes: number): Promise<Uint8Array> {
    const resposta = await this.cliente.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Range: `bytes=0-${String(bytes - 1)}`,
      }),
    );
    return resposta.Body === undefined ? new Uint8Array() : resposta.Body.transformToByteArray();
  }

  async apagar(chave: string): Promise<void> {
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }

  async gravar(chave: string, corpo: Uint8Array, tipoConteudo: string): Promise<void> {
    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: corpo,
        ContentType: tipoConteudo,
      }),
    );
  }
}

/** Sem `S3_BUCKET`: as rotas de arquivo respondem 503 em vez de falhar a subida da API. */
export class ArmazenamentoDesligado extends ArmazenamentoArquivos {
  private erro(): Promise<never> {
    return Promise.reject(
      new ErroDominio('SERVICO_INDISPONIVEL', {
        mensagem: 'O envio de arquivos não está disponível agora.',
      }),
    );
  }

  urlDeEnvio(): Promise<string> {
    return this.erro();
  }

  urlDeLeitura(): Promise<string> {
    return this.erro();
  }

  consultar(): Promise<ObjetoArquivo | null> {
    return this.erro();
  }

  lerInicio(): Promise<Uint8Array> {
    return this.erro();
  }

  apagar(): Promise<void> {
    return this.erro();
  }

  gravar(): Promise<void> {
    return this.erro();
  }
}

const ascii = (texto: string): number[] => [...new TextEncoder().encode(texto)];

/** O começo de um arquivo de verdade de cada extensão, para o armazenamento em memória. */
export const INICIO_DA_EXTENSAO = {
  jpg: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
  png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  webp: Uint8Array.from([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP')]),
  heic: Uint8Array.from([0, 0, 0, 0x18, ...ascii('ftypheic')]),
  pdf: Uint8Array.from(ascii('%PDF-1.7')),
  m4a: Uint8Array.from([0, 0, 0, 0x1c, ...ascii('ftypM4A ')]),
  aac: Uint8Array.from([0xff, 0xf1, 0x50, 0x80]),
  mp3: Uint8Array.from(ascii('ID3')),
  webm: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]),
} satisfies Record<string, Uint8Array>;

/** Em memória, para os testes: `simularEnvio` faz o papel do app enviando o arquivo. */
export class ArmazenamentoMemoria extends ArmazenamentoArquivos {
  readonly objetos = new Map<string, ObjetoArquivo>();
  /** O conteúdo do que foi gravado pelo servidor (`gravar`). */
  readonly conteudos = new Map<string, Uint8Array>();

  /**
   * Sem `inicio`, o arquivo começa como um de verdade do tipo da chave (`.jpg`, `.pdf`, `.m4a`…);
   * com ele, os primeiros bytes são esses (ex.: um executável com nome de foto).
   */
  simularEnvio(chave: string, tamanho: number, tipoConteudo?: string, inicio?: Uint8Array): void {
    this.objetos.set(chave, { tamanho, tipoConteudo });
    if (inicio !== undefined) this.conteudos.set(chave, inicio);
  }

  urlDeEnvio(chave: string, tipoConteudo: string, segundos: number): Promise<string> {
    const parametros = new URLSearchParams({ tipo: tipoConteudo, validade: String(segundos) });
    return Promise.resolve(`https://arquivos.teste/${chave}?envio&${parametros.toString()}`);
  }

  urlDeLeitura(chave: string, segundos: number, nomeArquivo?: string): Promise<string> {
    const nome = nomeArquivo === undefined ? '' : `&nome=${encodeURIComponent(nomeArquivo)}`;
    return Promise.resolve(
      `https://arquivos.teste/${chave}?leitura&validade=${String(segundos)}${nome}`,
    );
  }

  consultar(chave: string): Promise<ObjetoArquivo | null> {
    return Promise.resolve(this.objetos.get(chave) ?? null);
  }

  lerInicio(chave: string, bytes: number): Promise<Uint8Array> {
    const conteudo =
      this.conteudos.get(chave) ??
      (INICIO_DA_EXTENSAO as Record<string, Uint8Array | undefined>)[
        chave.slice(chave.lastIndexOf('.') + 1)
      ];
    return Promise.resolve((conteudo ?? new Uint8Array()).slice(0, bytes));
  }

  apagar(chave: string): Promise<void> {
    this.objetos.delete(chave);
    this.conteudos.delete(chave);
    return Promise.resolve();
  }

  gravar(chave: string, corpo: Uint8Array, tipoConteudo: string): Promise<void> {
    this.objetos.set(chave, { tamanho: corpo.byteLength, tipoConteudo });
    this.conteudos.set(chave, corpo);
    return Promise.resolve();
  }
}

export function criarArmazenamento(config: Configuracao): ArmazenamentoArquivos {
  const bucket = config.bucketArquivos;
  if (bucket === undefined) return new ArmazenamentoDesligado();
  const endereco = config.enderecoS3;
  const cliente = new S3Client({
    region: config.regiaoAws,
    ...(endereco === undefined ? {} : { endpoint: endereco, forcePathStyle: true }),
  });
  return new ArmazenamentoS3(cliente, bucket);
}

@Global()
@Module({
  providers: [
    { provide: ArmazenamentoArquivos, inject: [Configuracao], useFactory: criarArmazenamento },
  ],
  exports: [ArmazenamentoArquivos],
})
export class ArmazenamentoModule {}
