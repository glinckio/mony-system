import { Injectable, Logger } from '@nestjs/common';
import { LINKS_INTERNOS } from '@mony/shared/alertas';

import { Rotina } from '../../core/rotinas/rotinas';
import { CompartilhamentosService } from '../compartilhamentos/compartilhamentos.service';
import { type AlertaCandidato, MotorAlertas } from '../notificacoes/motor-alertas';
import { corpoDoAviso, disparar, inicioDoMinuto, precisaDePush } from './dominio/agenda';
import { LembretesRepository } from './lembretes.repository';
import { type DadosJobLigarLembrete, LigacoesLembrete } from './ligacoes-lembrete';

/** Lembretes tocados por volta da rotina; o que sobrar fica para o minuto seguinte. */
const LOTE = 500;

/**
 * Rotina por minuto (doc 09): toca os lembretes vencidos (a ocorrência atual ou a soneca). O aviso
 * é urgente e ignora o horário de silêncio (RN-077), com [Feito] e [Adiar] (categoria `lembrete`) e
 * a ocorrência no link. Quem aceitou o convite do lembrete (RN-074, T-124c) recebe o mesmo push,
 * com a hora no fuso dele e o nome do dono, mesmo que o dono só tenha o alarme (o alarme é do
 * aparelho do dono). Com o canal ligação (RN-078, T-122a), o aviso também vira um job de ligação
 * para o dono na fila `lembretes`. Depois do aviso, a repetição passa para a próxima ocorrência. Se
 * a rotina falhar no meio, a volta seguinte repete: a chave única do aviso segura a notificação e
 * a ligação repetidas.
 */
@Injectable()
export class DisparoLembretes {
  private readonly log = new Logger(DisparoLembretes.name);

  constructor(
    private readonly repositorio: LembretesRepository,
    private readonly motor: MotorAlertas,
    private readonly compartilhamentos: CompartilhamentosService,
    private readonly ligacoes: LigacoesLembrete,
  ) {}

  @Rotina({ nome: 'disparar-lembretes', padrao: '* * * * *' })
  async disparar(instante: Date): Promise<number> {
    // O agendador pode atrasar uns segundos: o minuto que vale é o do disparo.
    const agora = inicioDoMinuto(instante);
    const vencidos = await this.repositorio.vencidos(agora, LOTE);
    if (vencidos.length === 0) return 0;
    const [comIphone, convidados] = await Promise.all([
      this.repositorio.comIphone([...new Set(vencidos.map(({ usuarioId }) => usuarioId))]),
      this.compartilhamentos.convidadosAceitos(
        'lembrete',
        vencidos.map(({ id }) => id),
      ),
    ]);
    const disparos = vencidos.map((lembrete) => ({
      lembrete,
      disparo: disparar(lembrete, agora, lembrete.fuso),
    }));
    const ligacoes: DadosJobLigarLembrete[] = [];
    const candidatos: AlertaCandidato[] = disparos.flatMap(({ lembrete, disparo }) => {
      const comPush = precisaDePush(lembrete.canais, comIphone.has(lembrete.usuarioId));
      if (lembrete.canais.includes('ligacao')) {
        for (const aviso of disparo.avisos) {
          ligacoes.push({
            usuarioId: lembrete.usuarioId,
            lembreteId: lembrete.id,
            chaveUnica: aviso.chaveUnica,
            titulo: lembrete.titulo,
            corpo: corpoDoAviso(lembrete.dataHora, aviso.adiado, lembrete.fuso),
            linkInterno: LINKS_INTERNOS.lembrete(lembrete.id, aviso.ocorrencia),
            comPush,
          });
        }
      }
      const destinos = [
        ...(comPush ? [{ usuarioId: lembrete.usuarioId, fuso: lembrete.fuso, de: '' }] : []),
        ...(convidados.get(lembrete.id) ?? []).map(({ usuarioId, fuso, donoNome }) => ({
          usuarioId,
          fuso,
          de: `, de ${donoNome}`,
        })),
      ];
      return destinos.flatMap(({ usuarioId, fuso, de }) =>
        disparo.avisos.map((aviso) => ({
          usuarioId,
          tipo: 'lembrete' as const,
          chaveUnica: aviso.chaveUnica,
          urgente: true,
          titulo: lembrete.titulo,
          corpo: `${corpoDoAviso(lembrete.dataHora, aviso.adiado, fuso)}${de}`,
          linkInterno: LINKS_INTERNOS.lembrete(lembrete.id, aviso.ocorrencia),
          vaiParaChat: false,
        })),
      );
    });
    if (candidatos.length > 0) await this.motor.emitir(candidatos, agora);
    if (ligacoes.length > 0) await this.ligacoes.pedir(ligacoes);
    let tocados = 0;
    for (const { lembrete, disparo } of disparos) {
      if (await this.repositorio.registrarDisparo(lembrete, disparo.mudancas)) {
        tocados += 1;
      } else {
        this.log.log(`Lembrete ${lembrete.id} mudou durante o disparo; volta no próximo minuto`);
      }
    }
    return tocados;
  }
}
