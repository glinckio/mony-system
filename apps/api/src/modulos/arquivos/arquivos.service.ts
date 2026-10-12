import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  type DadosNovoArquivo,
  type EnvioArquivo,
  type LeituraArquivo,
  TAMANHO_MAXIMO_ANEXO,
  VALIDADE_URL_ENVIO_SEGUNDOS,
  VALIDADE_URL_LEITURA_SEGUNDOS,
} from '@mony/shared/arquivos';
import type { TipoAnexo } from '@mony/shared/enums';

import { ArmazenamentoArquivos } from '../../core/arquivos/armazenamento-arquivos';
import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { ArquivosRepository } from './arquivos.repository';

const EXTENSOES: Record<DadosNovoArquivo['tipoConteudo'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
};

const TIPO_DA_EXTENSAO = new Map(
  Object.entries(EXTENSOES).map(([tipoConteudo, extensao]) => [extensao, tipoConteudo]),
);

/** O que a Mony faz com o arquivo: transcreve o áudio, lê a imagem ou o PDF. */
export interface ArquivoMony {
  tipo: 'audio' | 'imagem' | 'pdf';
  url: string;
  tipoConteudo: string;
}

/** T-065: o provedor de IA lê imagem de até 5 MB, em JPEG, PNG ou WebP. */
export const TAMANHO_MAXIMO_IMAGEM_LEITURA = 5 * 1024 * 1024;
const IMAGENS_LIDAS = new Set(['image/jpeg', 'image/png', 'image/webp']);

function tipoParaMony(tipo: TipoAnexo, tipoConteudo: string): ArquivoMony['tipo'] {
  if (tipo === 'audio') {
    if (tipoConteudo.startsWith('audio/')) return 'audio';
  } else if (tipoConteudo === 'application/pdf') {
    return 'pdf';
  } else if (IMAGENS_LIDAS.has(tipoConteudo)) {
    return 'imagem';
  } else if (tipoConteudo === 'image/heic') {
    throw new ErroDominio('REQUISICAO_INVALIDA', {
      mensagem: 'A Mony ainda não lê fotos em HEIC. Mande em JPEG ou PNG.',
    });
  }
  throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'A Mony não lê este tipo de arquivo.' });
}

/**
 * Anexos (doc 05, doc 11). O app pede a URL de envio, manda o arquivo direto para o S3 e depois
 * informa o anexo no recurso (`anexoIds`, ou o `arquivoId` do áudio para a Mony); só então a API
 * confere que ele chegou.
 */
@Injectable()
export class ArquivosService {
  constructor(
    private readonly repositorio: ArquivosRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly clock: Clock,
  ) {}

  async preparar(contexto: Contexto, dados: DadosNovoArquivo): Promise<EnvioArquivo> {
    const usuarioId = usuarioDoContexto(contexto);
    // A chave começa pelo usuário (doc 11) e não revela o id do anexo.
    const chave = `usuarios/${usuarioId}/anexos/${randomUUID()}.${EXTENSOES[dados.tipoConteudo]}`;
    const url = await this.armazenamento.urlDeEnvio(
      chave,
      dados.tipoConteudo,
      VALIDADE_URL_ENVIO_SEGUNDOS,
    );
    const anexo = await this.repositorio.criar(usuarioId, {
      tipo: dados.tipo,
      chave,
      tamanho: dados.tamanho,
    });
    return {
      id: anexo.id,
      metodo: 'PUT',
      url,
      cabecalhos: { 'content-type': dados.tipoConteudo },
      expiraEm: this.expiraEm(VALIDADE_URL_ENVIO_SEGUNDOS),
    };
  }

  async ler(contexto: Contexto, id: string): Promise<LeituraArquivo> {
    const anexo = await this.repositorio.buscar(usuarioDoContexto(contexto), id);
    if (!anexo) throw new ErroDominio('NAO_ENCONTRADO');
    return {
      id: anexo.id,
      tipo: anexo.tipo,
      tamanho: anexo.tamanho,
      url: await this.armazenamento.urlDeLeitura(anexo.arquivoUrl, VALIDADE_URL_LEITURA_SEGUNDOS),
      expiraEm: this.expiraEm(VALIDADE_URL_LEITURA_SEGUNDOS),
    };
  }

  /**
   * Antes de ligar anexos a uma transação: são do usuário, estão livres (ou já nesta transação) e
   * o arquivo chegou ao S3 dentro do tamanho máximo. Grava o tamanho real.
   */
  async conferirParaVincular(
    usuarioId: string,
    ids: readonly string[],
    transacaoId: string | null,
  ): Promise<void> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return;
    const anexos = await this.repositorio.buscarVarios(usuarioId, unicos);
    if (anexos.length !== unicos.length) throw new ErroDominio('NAO_ENCONTRADO');
    for (const anexo of anexos) {
      if (anexo.tipo === 'audio') {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'Áudio não vai como anexo de lançamento.',
          detalhes: { anexoId: anexo.id },
        });
      }
      if (anexo.transacaoId !== null && anexo.transacaoId !== transacaoId) {
        throw new ErroDominio('CONFLITO', {
          mensagem: 'Este anexo já está em outro lançamento.',
          detalhes: { anexoId: anexo.id },
        });
      }
      const objeto = await this.armazenamento.consultar(anexo.arquivoUrl);
      if (objeto === null) {
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'O arquivo ainda não terminou de ser enviado.',
          detalhes: { anexoId: anexo.id },
        });
      }
      if (objeto.tamanho > TAMANHO_MAXIMO_ANEXO) {
        await this.armazenamento.apagar(anexo.arquivoUrl);
        throw new ErroDominio('REQUISICAO_INVALIDA', {
          mensagem: 'O arquivo passa de 10 MB.',
          detalhes: { anexoId: anexo.id },
        });
      }
      if (objeto.tamanho !== anexo.tamanho) {
        await this.repositorio.atualizarTamanho(anexo.id, objeto.tamanho);
      }
    }
  }

  /**
   * O arquivo de uma mensagem para a Mony: do usuário, fora de lançamento e já no S3 dentro do
   * tamanho máximo. Áudio vai para a transcrição (T-064); foto, print ou PDF, para a leitura
   * (T-065), que não aceita HEIC nem imagem acima de 5 MB. Devolve a URL de leitura (15 min).
   */
  async arquivoParaMony(contexto: Contexto, id: string): Promise<ArquivoMony> {
    const anexo = await this.repositorio.buscar(usuarioDoContexto(contexto), id);
    if (!anexo || anexo.transacaoId !== null) throw new ErroDominio('NAO_ENCONTRADO');
    const objeto = await this.armazenamento.consultar(anexo.arquivoUrl);
    if (objeto === null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'O arquivo ainda não terminou de ser enviado.',
      });
    }
    if (objeto.tamanho > TAMANHO_MAXIMO_ANEXO) {
      await this.armazenamento.apagar(anexo.arquivoUrl);
      throw new ErroDominio('REQUISICAO_INVALIDA', { mensagem: 'O arquivo passa de 10 MB.' });
    }
    const extensao = anexo.arquivoUrl.slice(anexo.arquivoUrl.lastIndexOf('.') + 1);
    const tipoConteudo = objeto.tipoConteudo ?? TIPO_DA_EXTENSAO.get(extensao) ?? '';
    const tipo = tipoParaMony(anexo.tipo, tipoConteudo);
    if (tipo === 'imagem' && objeto.tamanho > TAMANHO_MAXIMO_IMAGEM_LEITURA) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'A imagem passa de 5 MB. Mande uma foto menor.',
      });
    }
    return {
      tipo,
      tipoConteudo,
      url: await this.armazenamento.urlDeLeitura(anexo.arquivoUrl, VALIDADE_URL_LEITURA_SEGUNDOS),
    };
  }

  private expiraEm(segundos: number): string {
    return new Date(this.clock.agora().getTime() + segundos * 1000).toISOString();
  }
}
