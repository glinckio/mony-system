import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { dataNoFuso } from '@mony/shared/datas';
import {
  type DadosPedidoExclusaoConta,
  type ExclusaoConta,
  PRAZO_EXCLUSAO_CONTA_DIAS,
} from '@mony/shared/usuario';
import type { Queue } from 'bullmq';

import { ArmazenamentoArquivos } from '../../core/arquivos/armazenamento-arquivos';
import { Clock } from '../../core/clock/clock';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { FILAS, idDeJob } from '../../core/filas/filas';
import { LimiteTentativas } from '../../core/limites/limite-tentativas';
import { Rotina } from '../../core/rotinas/rotinas';
import { EnvioEmails } from '../../integracoes/email/envio-emails';
import {
  emailCodigoExclusaoConta,
  emailContaExcluida,
  emailExclusaoAgendada,
} from '../../integracoes/email/modelos/exclusao-conta';
import { AgendaService } from '../agenda/agenda.service';
import { AssinaturasService } from '../assinaturas/assinaturas.service';
import {
  gerarCodigoRecuperacao,
  situacaoCodigo,
  somarMinutos,
  VALIDADE_CODIGO_MINUTOS,
} from '../autenticacao/dominio/codigos';
import {
  JANELA_TENTATIVAS_SEGUNDOS,
  MAXIMO_TENTATIVAS_EMAIL,
} from '../autenticacao/dominio/sessoes';
import { RecuperacaoSenhaRepository } from '../autenticacao/recuperacao-senha.repository';
import { conferirSenha, gerarHashSenha } from '../autenticacao/senhas';
import { type ContaParaExclusao, ExclusaoContaRepository } from './exclusao-conta.repository';

/** O job da fila `privacidade` que faz a exclusão definitiva de uma conta. */
export const JOB_EXCLUIR_CONTA = 'excluir-conta';
export interface DadosJobExcluirConta {
  usuarioId: string;
}
/** Tentativas do job; a rotina põe de novo na fila na hora seguinte se todas falharem. */
export const TENTATIVAS_EXCLUSAO_CONTA = 5;

/** "2026-10-23" → "23/10/2026". */
const dataBr = (data: string): string => data.split('-').reverse().join('/');

/**
 * Excluir a conta (RN-161, T-140b, doc 11). O pedido, confirmado com a senha ou com um código por
 * e-mail, agenda a exclusão para daqui a 7 dias, encerra as sessões e agenda o cancelamento da
 * assinatura no fim do período. Nesses dias, entrar de novo e desistir desfaz tudo. Vencido o
 * prazo, a rotina `excluir-contas` põe o job na fila `privacidade`, que cancela a assinatura na
 * hora, apaga os arquivos do S3 e apaga os dados, deixando a linha de `usuarios` anonimizada.
 * A `controle_teste` fica (RN-125): voltar com o mesmo e-mail não dá outro teste grátis.
 */
@Injectable()
export class ExclusaoContaService {
  private readonly log = new Logger(ExclusaoContaService.name);

  constructor(
    private readonly repositorio: ExclusaoContaRepository,
    private readonly codigos: RecuperacaoSenhaRepository,
    private readonly assinaturas: AssinaturasService,
    private readonly agendas: AgendaService,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly emails: EnvioEmails,
    private readonly limites: LimiteTentativas,
    private readonly clock: Clock,
    @InjectQueue(FILAS.privacidade) private readonly fila: Queue<DadosJobExcluirConta>,
  ) {}

  async situacao(usuarioId: string): Promise<ExclusaoConta> {
    const conta = await this.contaAtiva(usuarioId);
    return { agendadaPara: conta.exclusaoAgendadaPara?.toISOString() ?? null };
  }

  /** O código de 6 dígitos por e-mail, para quem confirma sem a senha. */
  async pedirCodigo(usuarioId: string, ip: string): Promise<void> {
    const conta = await this.contaAtiva(usuarioId);
    await this.contarTentativa(usuarioId, ip, 'pedido');
    const codigo = gerarCodigoRecuperacao();
    const agora = this.clock.agora();
    const { id } = await this.codigos.criarCodigo(
      {
        usuarioId,
        finalidade: 'exclusao_conta',
        codigoHash: await gerarHashSenha(codigo),
        expiraEm: somarMinutos(agora, VALIDADE_CODIGO_MINUTOS),
        ip,
      },
      agora,
    );
    await this.emails.enfileirar(
      emailCodigoExclusaoConta({
        nome: conta.nome,
        email: conta.email,
        codigo,
        validadeMinutos: VALIDADE_CODIGO_MINUTOS,
      }),
      idDeJob('codigo-exclusao-conta', id),
    );
  }

  /**
   * RN-161: confere a senha ou o código e agenda a exclusão. Pedir de novo com a exclusão já
   * agendada devolve a mesma data.
   */
  async pedir(
    usuarioId: string,
    dados: DadosPedidoExclusaoConta,
    ip: string,
  ): Promise<ExclusaoConta> {
    const conta = await this.contaAtiva(usuarioId);
    await this.contarTentativa(usuarioId, ip, 'confirmacao');
    if (dados.senha === undefined) await this.gastarCodigo(conta, dados.codigo ?? '');
    else if (!(await conferirSenha(conta.senhaHash, dados.senha))) {
      throw new ErroDominio('SENHA_INCORRETA');
    }
    if (conta.exclusaoAgendadaPara !== null) {
      return { agendadaPara: conta.exclusaoAgendadaPara.toISOString() };
    }

    const agora = this.clock.agora();
    const para = new Date(agora.getTime() + PRAZO_EXCLUSAO_CONTA_DIAS * 86_400_000);
    const cancelou = await this.assinaturas.agendarCancelamentoDaExclusao(usuarioId);
    await this.repositorio.agendar(usuarioId, para, cancelou, agora);
    await this.emails.enfileirar(
      emailExclusaoAgendada({
        nome: conta.nome,
        email: conta.email,
        dataExclusao: dataBr(dataNoFuso(para, conta.fusoHorario)),
      }),
      idDeJob('exclusao-agendada', usuarioId, para.getTime()),
    );
    this.log.log({ usuarioId, para: para.toISOString() }, 'Exclusão da conta agendada');
    return { agendadaPara: para.toISOString() };
  }

  /** RN-161: desistir dentro do prazo; a assinatura volta a renovar se o pedido a tinha cancelado. */
  async desistir(usuarioId: string): Promise<ExclusaoConta> {
    const conta = await this.contaAtiva(usuarioId);
    if (conta.exclusaoAgendadaPara === null) return { agendadaPara: null };
    if (conta.exclusaoCancelouAssinatura) {
      await this.assinaturas.desfazerCancelamentoDaExclusao(usuarioId);
    }
    await this.repositorio.desistir(usuarioId);
    this.log.log({ usuarioId }, 'Exclusão da conta desfeita');
    return { agendadaPara: null };
  }

  /** De hora em hora, no minuto 20: as exclusões vencidas vão para a fila `privacidade`. */
  @Rotina({ nome: 'excluir-contas', padrao: '20 * * * *' })
  async agendarVencidas(agora: Date): Promise<{ enfileiradas: number }> {
    const vencidas = await this.repositorio.vencidas(agora);
    for (const usuarioId of vencidas) {
      await this.fila.add(
        JOB_EXCLUIR_CONTA,
        { usuarioId },
        {
          // Um id por hora: se as tentativas acabarem, a próxima rodada tenta de novo.
          jobId: idDeJob(JOB_EXCLUIR_CONTA, usuarioId, Math.floor(agora.getTime() / 3_600_000)),
          attempts: TENTATIVAS_EXCLUSAO_CONTA,
          backoff: { type: 'exponential', delay: 60_000 },
        },
      );
    }
    if (vencidas.length > 0) this.log.log(`Exclusões de conta na fila: ${String(vencidas.length)}`);
    return { enfileiradas: vencidas.length };
  }

  /**
   * No worker: a exclusão definitiva. Cancela a assinatura na hora, revoga as agendas no provedor,
   * apaga os arquivos e depois os dados. Cada passo pode repetir sem estrago, então a nova tentativa recomeça do início.
   */
  async excluir(usuarioId: string): Promise<void> {
    const conta = await this.repositorio.conta(usuarioId);
    const agora = this.clock.agora();
    if (
      conta === null ||
      conta.status === 'excluido' ||
      conta.exclusaoAgendadaPara === null ||
      conta.exclusaoAgendadaPara > agora
    ) {
      return;
    }
    await this.assinaturas.cancelarParaExclusao(usuarioId);
    await this.agendas.revogarTodas(usuarioId);
    const chaves = await this.repositorio.chavesDeArquivos(usuarioId);
    for (const chave of chaves) await this.armazenamento.apagar(chave);
    if (!(await this.repositorio.apagar(usuarioId, agora))) return;
    await this.emails.enfileirar(
      emailContaExcluida({ nome: conta.nome, email: conta.email }),
      idDeJob('conta-excluida', usuarioId),
    );
    this.log.log({ usuarioId, arquivos: chaves.length }, 'Conta excluída');
  }

  private async contaAtiva(usuarioId: string): Promise<ContaParaExclusao> {
    const conta = await this.repositorio.conta(usuarioId);
    if (conta === null || conta.status === 'excluido') throw new ErroDominio('NAO_ENCONTRADO');
    return conta;
  }

  /** RN-008: tentativas por conta e por IP, para o código e a senha não serem adivinhados. */
  private async contarTentativa(
    usuarioId: string,
    ip: string,
    tipo: 'pedido' | 'confirmacao',
  ): Promise<void> {
    await this.limites.registrar(
      [
        { chave: `exclusao:${tipo}:usuario:${usuarioId}`, maximo: MAXIMO_TENTATIVAS_EMAIL },
        { chave: `exclusao:${tipo}:ip:${ip}`, maximo: MAXIMO_TENTATIVAS_EMAIL * 4 },
      ],
      JANELA_TENTATIVAS_SEGUNDOS,
    );
  }

  /** O último código de exclusão da pessoa: errado conta uma tentativa (RN-003); certo é gasto. */
  private async gastarCodigo(conta: ContaParaExclusao, codigo: string): Promise<void> {
    const ultimo = await this.codigos.ultimoCodigo(conta.id, 'exclusao_conta');
    if (ultimo === null) {
      await conferirSenha(null, codigo);
      throw new ErroDominio('CODIGO_INVALIDO');
    }
    if (situacaoCodigo(ultimo, this.clock.agora()) === 'expirado') {
      throw new ErroDominio('CODIGO_EXPIRADO');
    }
    if (!(await conferirSenha(ultimo.codigoHash, codigo))) {
      await this.codigos.registrarErro(ultimo.id);
      throw new ErroDominio('CODIGO_INVALIDO');
    }
    if (!(await this.codigos.gastarCodigo(ultimo.id, conta.id))) {
      throw new ErroDominio('CODIGO_EXPIRADO');
    }
  }
}
