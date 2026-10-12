import { Module } from '@nestjs/common';

import { IaModule } from '../../integracoes/ia/ia.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { CategoriasModule } from '../categorias/categorias.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { ParcelamentosModule } from '../parcelamentos/parcelamentos.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ContextoMonyService } from './contexto.service';
import { ConsultarTransacoesTool } from './ferramentas/consultar-transacoes.tool';
import { CriarCategoriaTool } from './ferramentas/criar-categoria.tool';
import { CriarParcelamentoTool } from './ferramentas/criar-parcelamento.tool';
import { CriarTransacaoTool } from './ferramentas/criar-transacao.tool';
import { EditarTransacaoTool } from './ferramentas/editar-transacao.tool';
import { ExcluirTransacaoTool } from './ferramentas/excluir-transacao.tool';
import { ListarCartoesTool } from './ferramentas/listar-cartoes.tool';
import { ListarCategoriasTool } from './ferramentas/listar-categorias.tool';
import { FERRAMENTAS_MONY, type Ferramenta, RegistroFerramentas } from './ferramentas/registro';
import { MonyController } from './mony.controller';
import { LancamentosMony } from './lancamentos.service';
import { MonyService } from './mony.service';
import { MonyOrquestrador } from './orquestrador.service';
import { RascunhosModule } from './rascunhos.module';
import { RoteadorRegras } from './roteador-regras.service';

/** Ferramentas que o modelo pode chamar. As de consulta e planejamento entram na T-062b. */
const FERRAMENTAS = [
  ListarCategoriasTool,
  ListarCartoesTool,
  CriarCategoriaTool,
  CriarTransacaoTool,
  CriarParcelamentoTool,
  EditarTransacaoTool,
  ExcluirTransacaoTool,
  ConsultarTransacoesTool,
];

/**
 * Mony (doc 08): orquestrador (regras, modelo e ferramentas), rascunhos de lançamento, histórico
 * da conversa e `logs_ia`. A limpeza dos rascunhos vencidos roda no worker.
 * Ferramentas e contexto só chamam Services de outros módulos (doc 05).
 */
@Module({
  imports: [
    IaModule,
    CartoesModule,
    CategoriasModule,
    OrcamentosModule,
    ParcelamentosModule,
    TransacoesModule,
    UsuariosModule,
    RascunhosModule,
  ],
  controllers: [MonyController],
  providers: [
    MonyOrquestrador,
    MonyService,
    RoteadorRegras,
    LancamentosMony,
    ContextoMonyService,
    RegistroFerramentas,
    ...FERRAMENTAS,
    {
      provide: FERRAMENTAS_MONY,
      inject: FERRAMENTAS,
      useFactory: (...ferramentas: Ferramenta[]) => ferramentas,
    },
  ],
})
export class MonyModule {}
