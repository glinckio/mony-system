import { Injectable } from '@nestjs/common';
import type { TokenSegundoPlano } from '@mony/shared/autenticacao';

import { SessoesAtivas } from '../../core/auth/sessoes-ativas';
import { TokensAcesso, type UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { ErroDominio } from '../../core/erros/erro-dominio';

/**
 * O token da tarefa que trata o push com o app fechado (T-088b, RN-004), para ela não renovar a
 * sessão junto com o app. O app pede um novo a cada abertura; ele vale até 30 dias, nunca além da
 * sessão do aparelho, e cai junto com a família dela. Só com o token do app: a guarda recusa o de
 * segundo plano nesta rota (sem `@SegundoPlano()`), então ele não se renova sozinho.
 */
@Injectable()
export class TokenSegundoPlanoService {
  constructor(
    private readonly tokens: TokensAcesso,
    private readonly sessoes: SessoesAtivas,
  ) {}

  async emitir(usuario: UsuarioAutenticado): Promise<TokenSegundoPlano> {
    const { dispositivoId } = usuario;
    const familiaId = await this.sessoes.familiaDaSessao(usuario);
    if (dispositivoId === null || familiaId === null) throw new ErroDominio('SESSAO_INVALIDA');
    const fim = await this.sessoes.fimDaFamilia({ id: usuario.id, dispositivoId, familiaId });
    if (fim === null) throw new ErroDominio('SESSAO_INVALIDA');
    const { token, expiraEm } = await this.tokens.emitirSegundoPlano(
      { id: usuario.id, sessaoId: usuario.sessaoId, dispositivoId, familiaId },
      fim,
    );
    return { token, expiraEm: expiraEm.toISOString() };
  }
}
