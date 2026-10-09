import { CATALOGO_ERROS, type CodigoErro } from '@mony/shared/erros';

/**
 * Erro esperado de regra de negócio. Os Services lançam este erro com um código do catálogo de
 * `@mony/shared/erros`; o filtro global transforma em `{ erro: { codigo, mensagem, detalhes } }`
 * com o status HTTP do catálogo.
 *
 * Ex.: `throw new ErroDominio('LIMITE_PLANO_ATINGIDO', { detalhes: { recurso: 'lancamento' } })`.
 */
export class ErroDominio extends Error {
  readonly detalhes: Record<string, unknown> | undefined;

  constructor(
    readonly codigo: CodigoErro,
    opcoes: { mensagem?: string; detalhes?: Record<string, unknown> } = {},
  ) {
    super(opcoes.mensagem ?? CATALOGO_ERROS[codigo].mensagem);
    this.name = 'ErroDominio';
    this.detalhes = opcoes.detalhes;
  }

  get status(): number {
    return CATALOGO_ERROS[this.codigo].status;
  }
}
