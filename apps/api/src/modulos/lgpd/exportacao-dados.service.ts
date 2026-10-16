import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { dataNoFuso, horaNoFuso } from '@mony/shared/datas';
import {
  type ExportacaoDados,
  type UltimaExportacaoDados,
  VALIDADE_URL_EXPORTACAO_DADOS_SEGUNDOS,
} from '@mony/shared/usuario';
import type { Queue } from 'bullmq';

import { ArmazenamentoArquivos } from '../../core/arquivos/armazenamento-arquivos';
import { Clock } from '../../core/clock/clock';
import { FILAS, idDeJob } from '../../core/filas/filas';
import { EnvioEmails } from '../../integracoes/email/envio-emails';
import { emailExportacaoDados } from '../../integracoes/email/modelos/exportacao-dados';
import { gerarArquivoDados } from './arquivo-dados';
import {
  type ExportacaoDadosGravada,
  ExportacaoDadosRepository,
} from './exportacao-dados.repository';

/** O job da fila `privacidade` que gera o arquivo. */
export const JOB_EXPORTAR_DADOS = 'exportar-dados';
export interface DadosJobExportarDados {
  exportacaoId: string;
}
/** Tentativas do job; na última falha, a exportação fica com `erro`. */
export const TENTATIVAS_EXPORTACAO_DADOS = 3;

/**
 * O bucket apaga `exportacoes/` em 7 dias (infra, `dias_exportacoes`); a URL de 24 h só sai até
 * o 6º dia, para não apontar para um arquivo que some antes de ela expirar. Depois, pede de novo.
 */
const DIAS_ARQUIVO_DISPONIVEL = 6;

/** "2026-10-16" → "16/10/2026". */
const dataBr = (data: string): string => data.split('-').reverse().join('/');

/**
 * Exportar meus dados (RN-160, T-140a, doc 11): o pedido grava a exportação e põe o job na fila
 * `privacidade`; o worker junta todas as tabelas da pessoa num ZIP (JSON e XLSX), guarda no S3
 * em `exportacoes/dados/` (que o bucket apaga em 7 dias) e manda o link por e-mail. O app mostra
 * a última com a URL assinada de 24 h. Vale para todos os planos.
 */
@Injectable()
export class ExportacaoDadosService {
  constructor(
    private readonly repositorio: ExportacaoDadosRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly emails: EnvioEmails,
    private readonly clock: Clock,
    @InjectQueue(FILAS.privacidade) private readonly fila: Queue<DadosJobExportarDados>,
  ) {}

  async pedir(usuarioId: string): Promise<ExportacaoDados> {
    const exportacao =
      (await this.repositorio.emAndamento(usuarioId)) ?? (await this.repositorio.criar(usuarioId));
    await this.fila.add(
      JOB_EXPORTAR_DADOS,
      { exportacaoId: exportacao.id },
      {
        jobId: idDeJob(JOB_EXPORTAR_DADOS, exportacao.id),
        attempts: TENTATIVAS_EXPORTACAO_DADOS,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    );
    return this.paraResposta(exportacao);
  }

  async ultima(usuarioId: string): Promise<UltimaExportacaoDados> {
    const exportacao = await this.repositorio.ultima(usuarioId);
    return { exportacao: exportacao ? await this.paraResposta(exportacao) : null };
  }

  /** No worker: gera o ZIP, guarda no S3, marca como pronta e manda o link por e-mail. */
  async gerar(exportacaoId: string): Promise<void> {
    const exportacao = await this.repositorio.buscarParaGerar(exportacaoId);
    if (exportacao?.status !== 'processando') return;
    const { usuarioId } = exportacao;
    const usuario = await this.repositorio.usuario(usuarioId);
    const agora = this.clock.agora();
    const corpo = gerarArquivoDados(await this.repositorio.dados(usuarioId), {
      nome: usuario.nome,
      email: usuario.email,
      geradoEm: agora.toISOString(),
      geradoEmLocal: `${dataBr(dataNoFuso(agora, usuario.fuso))} às ${horaNoFuso(agora, usuario.fuso)}`,
    });
    const chave = `exportacoes/dados/${usuarioId}/${exportacao.id}.zip`;
    await this.armazenamento.gravar(chave, corpo, 'application/zip');
    await this.repositorio.concluir(exportacao.id, chave, this.clock.agora());
    await this.emails.enfileirar(
      emailExportacaoDados({
        nome: usuario.nome,
        email: usuario.email,
        url: await this.url(chave, agora),
        validadeHoras: VALIDADE_URL_EXPORTACAO_DADOS_SEGUNDOS / 3600,
      }),
      idDeJob('email-exportacao-dados', exportacao.id),
    );
  }

  /** As tentativas acabaram: a exportação fica com `erro` e o app oferece pedir de novo. */
  async falhar(exportacaoId: string): Promise<void> {
    await this.repositorio.falhar(exportacaoId, this.clock.agora());
  }

  private url(chave: string, quando: Date): Promise<string> {
    return this.armazenamento.urlDeLeitura(
      chave,
      VALIDADE_URL_EXPORTACAO_DADOS_SEGUNDOS,
      `meus-dados-${dataNoFuso(quando)}.zip`,
    );
  }

  private async paraResposta(exportacao: ExportacaoDadosGravada): Promise<ExportacaoDados> {
    const agora = this.clock.agora();
    const disponivel =
      exportacao.concluidaEm !== null &&
      agora.getTime() - exportacao.concluidaEm.getTime() < DIAS_ARQUIVO_DISPONIVEL * 86_400_000;
    const url =
      exportacao.status === 'pronta' && exportacao.chaveArquivo !== null && disponivel
        ? await this.url(exportacao.chaveArquivo, exportacao.concluidaEm ?? agora)
        : null;
    return {
      id: exportacao.id,
      status: exportacao.status,
      url,
      expiraEm:
        url === null
          ? null
          : new Date(agora.getTime() + VALIDADE_URL_EXPORTACAO_DADOS_SEGUNDOS * 1000).toISOString(),
      criadoEm: exportacao.criadoEm.toISOString(),
      concluidaEm: exportacao.concluidaEm?.toISOString() ?? null,
    };
  }
}
