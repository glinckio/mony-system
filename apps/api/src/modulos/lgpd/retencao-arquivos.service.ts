import { Injectable, Logger } from '@nestjs/common';

import { ArmazenamentoArquivos } from '../../core/arquivos/armazenamento-arquivos';
import { ParametrosService } from '../../core/parametros/parametros';
import { Rotina } from '../../core/rotinas/rotinas';
import { RetencaoArquivosRepository } from './retencao-arquivos.repository';

/** Anexos por lote; a rotina segue lote a lote até acabar ou chegar ao máximo da rodada. */
export const LOTE_RETENCAO = 500;
const LOTES_POR_RODADA = 40;

/**
 * Retenção de fotos, documentos e áudios (RN-162, T-140c, doc 11): todo dia às 03:30, apaga do
 * S3 os arquivos enviados há mais dias que o prazo do painel (`parametros.retencao`, padrão 90) e
 * tira a linha de `anexos`. O lançamento fica; só o arquivo sai. Roda no worker.
 */
@Injectable()
export class RetencaoArquivosService {
  private readonly log = new Logger(RetencaoArquivosService.name);

  constructor(
    private readonly repositorio: RetencaoArquivosRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly parametros: ParametrosService,
  ) {}

  @Rotina({ nome: 'limpar-arquivos', padrao: '30 3 * * *' })
  async limpar(agora: Date): Promise<{ apagados: number }> {
    const { diasArquivos } = (await this.parametros.obter()).retencao;
    const limite = new Date(agora.getTime() - diasArquivos * 86_400_000);
    let apagados = 0;
    for (let lote = 0; lote < LOTES_POR_RODADA; lote += 1) {
      const vencidos = await this.repositorio.vencidos(limite, LOTE_RETENCAO);
      // O arquivo sai antes da linha: se o S3 falhar, a próxima rodada tenta de novo.
      for (const { arquivoUrl } of vencidos) await this.armazenamento.apagar(arquivoUrl);
      await this.repositorio.apagar(vencidos.map(({ id }) => id));
      apagados += vencidos.length;
      if (vencidos.length < LOTE_RETENCAO) break;
    }
    if (apagados > 0)
      this.log.log(
        `Arquivos apagados pela retenção (${String(diasArquivos)} dias): ${String(apagados)}`,
      );
    return { apagados };
  }
}
