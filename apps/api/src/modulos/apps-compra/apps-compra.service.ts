import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { LINKS_INTERNOS } from '@mony/shared/alertas';
import {
  type DadosAberturaAppCompra,
  type DadosAtualizacaoAppsMonitorados,
  IDADE_MAXIMA_ABERTURA_MINUTOS,
  type ListaAppsMonitorados,
  type MotivoSemAlertaApp,
  PREFIXO_TOKEN_EVENTO,
  type ResultadoAberturaApp,
  type TokenEvento,
} from '@mony/shared/apps-compra';
import { competenciaDe, dataNoFuso } from '@mony/shared/datas';
import { formatarCentavos } from '@mony/shared/dinheiro';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { Clock } from '../../core/clock/clock';
import { type Contexto, usuarioDoContexto } from '../../core/contexto/contexto';
import { ErroDominio } from '../../core/erros/erro-dominio';
import { ParametrosService } from '../../core/parametros/parametros';
import { resumir } from '../autenticacao/dominio/sessoes';
import { RegistroConsentimentos } from '../consentimentos/registro-consentimentos';
import { MotorAlertas } from '../notificacoes/motor-alertas';
import { OrcamentosService } from '../orcamentos/orcamentos.service';
import { CotasService } from '../planos/cotas.service';
import { AppsCompraRepository } from './apps-compra.repository';

const HORA_MS = 3_600_000;

/** A frase do orçamento de compras no alerta ("Abriu a Shopee? Seu orçamento…", do PDF). */
export function fraseDoOrcamento(restanteCentavos: number | null): string {
  if (restanteCentavos === null) return 'Que tal ver quanto ainda cabe no mês antes de comprar?';
  if (restanteCentavos > 0) {
    return `Seu orçamento de compras tem ${formatarCentavos(restanteCentavos)} livres.`;
  }
  if (restanteCentavos === 0) return 'Seu orçamento de compras deste mês já acabou.';
  return `Seu orçamento de compras já passou ${formatarCentavos(-restanteCentavos)} do limite.`;
}

/**
 * Apps de compra (T-121a, doc 10, RN-104, RN-121). A pessoa escolhe os apps (`PUT
 * /apps-monitorados`) e, ao ligar o recurso, o aparelho recebe um token de evento só para mandar
 * as aberturas, porque o worker nativo roda sem a sessão do app. A abertura vira o alerta
 * `app_compra` com o orçamento da categoria Compras, no máximo um por app no intervalo do painel
 * (`alertas.intervaloAppCompraHoras`, padrão 24 h). O token cai ao sair do aparelho e ao perder o
 * plano pago.
 */
@Injectable()
export class AppsCompraService {
  constructor(
    private readonly repositorio: AppsCompraRepository,
    private readonly cotas: CotasService,
    private readonly orcamentos: OrcamentosService,
    private readonly motor: MotorAlertas,
    private readonly parametros: ParametrosService,
    private readonly consentimentos: RegistroConsentimentos,
    private readonly clock: Clock,
  ) {}

  async listar(contexto: Contexto): Promise<ListaAppsMonitorados> {
    const usuarioId = usuarioDoContexto(contexto);
    const [linhas, disponivel] = await Promise.all([
      this.repositorio.listar(usuarioId),
      this.cotas.temPlanoPago(usuarioId),
    ]);
    return {
      itens: linhas
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
        .map((linha) => ({
          identificadorApp: linha.identificadorApp,
          nome: linha.nome,
          ativo: linha.ativo,
          ultimoAlerta: linha.ultimoAlerta?.toISOString() ?? null,
        })),
      disponivel,
    };
  }

  /** A lista fica guardada em qualquer plano; os alertas só saem no pago (RN-121). */
  async atualizar(
    contexto: Contexto,
    dados: DadosAtualizacaoAppsMonitorados,
  ): Promise<ListaAppsMonitorados> {
    await this.repositorio.substituir(usuarioDoContexto(contexto), dados.itens);
    return this.listar(contexto);
  }

  /**
   * Liga o recurso no aparelho desta sessão: o token aparece só nesta resposta. Ligar é o
   * consentimento da finalidade `apps_compra` (doc 11, T-140d).
   */
  async emitirToken(usuario: UsuarioAutenticado, contexto: Contexto): Promise<TokenEvento> {
    await this.cotas.exigirPlanoPago(contexto, 'apps_compra');
    const dispositivoId = this.aparelho(usuario);
    const token = `${PREFIXO_TOKEN_EVENTO}${randomBytes(32).toString('base64url')}`;
    await this.repositorio.gravarToken(usuario.id, dispositivoId, resumir(token));
    await this.consentimentos.conceder(usuario.id, 'apps_compra');
    return { token };
  }

  /** Consentimento revogado (T-140d): nenhum aparelho manda mais aberturas; a lista fica. */
  async desligarDoUsuario(usuarioId: string): Promise<void> {
    await this.repositorio.revogarDoUsuario(usuarioId, this.clock.agora());
  }

  /** Desliga o recurso no aparelho desta sessão. */
  async revogarToken(usuario: UsuarioAutenticado): Promise<void> {
    await this.repositorio.revogarDoAparelho(this.aparelho(usuario), this.clock.agora());
  }

  /**
   * A abertura mandada pelo aparelho. Token que não vale → 401. Sem plano pago, o token cai e a
   * resposta é `RECURSO_EXIGE_PLANO_PAGO`: o aparelho para de mandar.
   */
  async registrarAbertura(
    token: string | undefined,
    dados: DadosAberturaAppCompra,
  ): Promise<ResultadoAberturaApp> {
    const agora = this.clock.agora();
    const registro =
      token?.startsWith(PREFIXO_TOKEN_EVENTO) === true
        ? await this.repositorio.tokenValido(resumir(token))
        : null;
    if (!registro) throw new ErroDominio('NAO_AUTENTICADO');
    const { usuarioId } = registro;
    if (!(await this.cotas.temPlanoPago(usuarioId))) {
      await this.repositorio.revogar(registro.id, agora);
      throw new ErroDominio('RECURSO_EXIGE_PLANO_PAGO', { detalhes: { recurso: 'apps_compra' } });
    }
    await this.repositorio.marcarUso(registro.id, agora);

    const semAlerta = (motivo: MotivoSemAlertaApp): ResultadoAberturaApp => ({
      alertado: false,
      motivo,
    });
    const aberto = new Date(dados.abertoEm);
    if (agora.getTime() - aberto.getTime() > IDADE_MAXIMA_ABERTURA_MINUTOS * 60_000) {
      return semAlerta('antigo');
    }
    // O relógio do aparelho pode estar adiantado: a abertura não fica no futuro.
    const instante = aberto > agora ? agora : aberto;
    const app = await this.repositorio.app(usuarioId, dados.identificadorApp);
    if (!app?.ativo) return semAlerta('nao_monitorado');

    const { intervaloAppCompraHoras } = (await this.parametros.obter()).alertas;
    const limite = new Date(instante.getTime() - intervaloAppCompraHoras * HORA_MS);
    if (!(await this.repositorio.reservarAlerta(app.id, instante, limite))) {
      return semAlerta('intervalo');
    }

    const { fusoHorario } = await this.repositorio.fuso(usuarioId);
    const competencia = competenciaDe(dataNoFuso(agora, fusoHorario));
    const resultado = await this.motor.emitir(
      [
        {
          usuarioId,
          tipo: 'app_compra',
          chaveUnica: `app:${app.identificadorApp}:${instante.toISOString()}`,
          urgente: false,
          soNaHora: true,
          titulo: `Abriu a ${app.nome}?`,
          corpo: fraseDoOrcamento(await this.restanteDeCompras(usuarioId, competencia)),
          linkInterno: LINKS_INTERNOS.orcamentos(competencia),
          vaiParaChat: false,
        },
      ],
      agora,
    );
    if (resultado.enviadas.length > 0) return { alertado: true, motivo: null };
    // Não saiu: o intervalo não conta, para a próxima abertura poder avisar.
    await this.repositorio.desfazerAlerta(app.id, instante, app.ultimoAlerta);
    const motivo = resultado.descartadas[0]?.motivo;
    return semAlerta(motivo === 'desligado' ? 'desligado' : 'silencio');
  }

  private async restanteDeCompras(usuarioId: string, competencia: string): Promise<number | null> {
    const categoria = await this.repositorio.categoriaCompras(usuarioId);
    if (!categoria) return null;
    const orcamento = await this.orcamentos.situacao(usuarioId, categoria.id, competencia);
    return orcamento?.restanteCentavos ?? null;
  }

  private aparelho(usuario: UsuarioAutenticado): string {
    if (usuario.dispositivoId === null) {
      throw new ErroDominio('REQUISICAO_INVALIDA', {
        mensagem: 'Esta sessão não tem aparelho; entre pelo app.',
      });
    }
    return usuario.dispositivoId;
  }
}
