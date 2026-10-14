import { Module } from '@nestjs/common';

import { IaModule } from '../../integracoes/ia/ia.module';
import { AjudaModule } from '../ajuda/ajuda.module';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { CartoesModule } from '../cartoes/cartoes.module';
import { CategoriasModule } from '../categorias/categorias.module';
import { LembretesModule } from '../lembretes/lembretes.module';
import { MetasModule } from '../metas/metas.module';
import { OrcamentosModule } from '../orcamentos/orcamentos.module';
import { ParcelamentosModule } from '../parcelamentos/parcelamentos.module';
import { PlanosModule } from '../planos/planos.module';
import { RelatoriosModule } from '../relatorios/relatorios.module';
import { TransacoesModule } from '../transacoes/transacoes.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { ConfigMonyService } from './config.service';
import { ConsultasNfceModule } from './consultas-nfce.module';
import { ConsultoriaMony } from './consultoria.service';
import { ContextoMonyService } from './contexto.service';
import { DocumentosMony } from './documentos.service';
import { AjudaAppTool } from './ferramentas/ajuda-app.tool';
import { AtualizarMetaTool } from './ferramentas/atualizar-meta.tool';
import { ConsultarCartaoTool } from './ferramentas/consultar-cartao.tool';
import { ConsultarLembretesTool } from './ferramentas/consultar-lembretes.tool';
import { ConsultarMetasTool } from './ferramentas/consultar-metas.tool';
import { ConsultarOrcamentosTool } from './ferramentas/consultar-orcamentos.tool';
import { ConsultarTransacoesTool } from './ferramentas/consultar-transacoes.tool';
import { CriarCategoriaTool } from './ferramentas/criar-categoria.tool';
import { CriarLembreteTool } from './ferramentas/criar-lembrete.tool';
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
import { NfceMony } from './nfce.service';
import { MonyOrquestrador } from './orquestrador.service';
import { PreferenciasService } from './preferencias.service';
import { RascunhosModule } from './rascunhos.module';
import { RoteadorRegras } from './roteador-regras.service';

/** Ferramentas que o modelo pode chamar: finanças (T-062a e T-062b), lembretes e ajuda (T-086a). */
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
  CriarLembreteTool,
  ConsultarLembretesTool,
  AjudaAppTool,
];

/**
 * Mony (doc 08): orquestrador (regras, modelo e ferramentas), rascunhos de lançamento, histórico
 * da conversa e `logs_ia`. A limpeza dos rascunhos vencidos roda no worker.
 * Ferramentas e contexto só chamam Services de outros módulos (doc 05).
 */
@Module({
  imports: [
    IaModule,
    AjudaModule,
    ArquivosModule,
    CartoesModule,
    CategoriasModule,
    MetasModule,
    OrcamentosModule,
    ParcelamentosModule,
    PlanosModule,
    RelatoriosModule,
    TransacoesModule,
    UsuariosModule,
    LembretesModule,
    RascunhosModule,
    ConsultasNfceModule,
  ],
  controllers: [MonyController],
  providers: [
    MonyOrquestrador,
    MonyService,
    RoteadorRegras,
    LancamentosMony,
    ConsultoriaMony,
    ConfigMonyService,
    DocumentosMony,
    NfceMony,
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
