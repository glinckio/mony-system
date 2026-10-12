import { Module } from '@nestjs/common';

import { IaModule } from '../../integracoes/ia/ia.module';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { CategoriasModule } from '../categorias/categorias.module';
import { MetasModule } from '../metas/metas.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { ParcelamentosModule } from '../parcelamentos/parcelamentos.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ContextoMonyService } from './contexto.service';
import { AtualizarMetaTool } from './ferramentas/atualizar-meta.tool';
import { ConsultarCartaoTool } from './ferramentas/consultar-cartao.tool';
import { ConsultarMetasTool } from './ferramentas/consultar-metas.tool';
import { ConsultarOrcamentosTool } from './ferramentas/consultar-orcamentos.tool';
import { ConsultarTransacoesTool } from './ferramentas/consultar-transacoes.tool';
import { CriarCategoriaTool } from './ferramentas/criar-categoria.tool';
import { CriarParcelamentoTool } from './ferramentas/criar-parcelamento.tool';
import { CriarTransacaoTool } from './ferramentas/criar-transacao.tool';
import { DefinirOrcamentoTool } from './ferramentas/definir-orcamento.tool';
import { EditarTransacaoTool } from './ferramentas/editar-transacao.tool';
import { ExcluirTransacaoTool } from './ferramentas/excluir-transacao.tool';
import { ListarCartoesTool } from './ferramentas/listar-cartoes.tool';
import { ListarCategoriasTool } from './ferramentas/listar-categorias.tool';
import { PagarFaturaTool } from './ferramentas/pagar-fatura.tool';
import { ResumoPeriodoTool } from './ferramentas/resumo-periodo.tool';
import { FERRAMENTAS_MONY, type Ferramenta, RegistroFerramentas } from './ferramentas/registro';
import { MonyController } from './mony.controller';
import { LancamentosMony } from './lancamentos.service';
import { MonyService } from './mony.service';
import { MonyOrquestrador } from './orquestrador.service';
import { PreferenciasService } from './preferencias.service';
import { RascunhosModule } from './rascunhos.module';
import { RoteadorRegras } from './roteador-regras.service';

/** Ferramentas de finanças que o modelo pode chamar (T-062a e T-062b). */
const FERRAMENTAS = [
  ListarCategoriasTool,
  ListarCartoesTool,
  CriarCategoriaTool,
  CriarTransacaoTool,
  CriarParcelamentoTool,
  EditarTransacaoTool,
  ExcluirTransacaoTool,
  ConsultarTransacoesTool,
  ResumoPeriodoTool,
  ConsultarCartaoTool,
  PagarFaturaTool,
  ConsultarOrcamentosTool,
  DefinirOrcamentoTool,
  ConsultarMetasTool,
  AtualizarMetaTool,
];

/**
 * Mony (doc 08): orquestrador (regras, modelo e ferramentas), rascunhos de lançamento, histórico
 * da conversa e `logs_ia`. A limpeza dos rascunhos vencidos roda no worker.
 * Ferramentas e contexto só chamam Services de outros módulos (doc 05).
 */
@Module({
  imports: [
    IaModule,
    ArquivosModule,
    CartoesModule,
    CategoriasModule,
    MetasModule,
    OrcamentosModule,
    ParcelamentosModule,
    RelatoriosModule,
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
    PreferenciasService,
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
