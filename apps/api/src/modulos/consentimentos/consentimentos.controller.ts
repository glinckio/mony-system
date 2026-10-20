import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  esquemaFinalidadeConsentimento,
  esquemaListaConsentimentos,
  type ListaConsentimentos,
} from '@mony/shared/consentimentos';

import type { UsuarioAutenticado } from '../../core/auth/tokens-acesso';
import { UsuarioAtual } from '../../core/auth/usuario-atual.decorator';
import { criarDto } from '../../core/openapi/dto';
import { RegistroConsentimentos } from './registro-consentimentos';
import { RevogacaoConsentimentos } from './revogacao-consentimentos';

class ListaConsentimentosDto extends criarDto(esquemaListaConsentimentos) {}
class FinalidadeConsentimentoDto extends criarDto(esquemaFinalidadeConsentimento) {}

/** Consentimentos (doc 05 e 11, T-140d). */
@ApiTags('consentimentos')
@ApiBearerAuth()
@Controller('consentimentos')
export class ConsentimentosController {
  constructor(
    private readonly registro: RegistroConsentimentos,
    private readonly revogacao: RevogacaoConsentimentos,
  ) {}

  @Get()
  @ApiOkResponse({
    type: ListaConsentimentosDto,
    description: 'Cada finalidade, se vale agora e as datas do último consentimento.',
  })
  async listar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ListaConsentimentos> {
    return { itens: await this.registro.listar(usuario.id) };
  }

  @Delete(':finalidade')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Consentimento revogado e o recurso desligado.' })
  revogar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param() { finalidade }: FinalidadeConsentimentoDto,
  ): Promise<void> {
    return this.revogacao.revogar(usuario.id, finalidade);
  }
}
